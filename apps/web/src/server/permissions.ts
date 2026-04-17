/**
 * @module server/permissions
 *
 * Loads the permission context for an authenticated user in a workspace.
 *
 * This runs BEFORE RLS is configured for the request — it is the bootstrap
 * step that computes which scopes the user can access and which permissions
 * they hold. The results feed into withRLS() and ctx.requirePermission().
 *
 * Uses SECURITY DEFINER functions via $queryRaw to bypass RLS for these
 * bootstrap queries. The Membership, Workspace, and Scope tables all have
 * RLS policies that require session variables to be set, but this code is
 * computing what those session variables should be — a chicken-and-egg
 * problem solved by the bootstrap functions created in the
 * 20260417070000_rls_bootstrap_functions migration.
 */

import { prisma } from "@watchtower/db";

export interface PermissionContext {
  readonly permissions: Set<string>;
  readonly accessibleScopeIds: string[];
}

/**
 * Load the complete permission context for a user in a workspace.
 *
 * @param userId - The authenticated user's ID (from Better Auth session)
 * @param workspaceId - The active workspace ID
 * @returns The computed permission set and accessible scope IDs
 */
export async function loadPermissionContext(
  userId: string,
  workspaceId: string,
): Promise<PermissionContext> {
  // 1. Load all memberships with their permission keys using the
  //    SECURITY DEFINER function that bypasses RLS.
  const membershipRows = await prisma.$queryRaw<
    Array<{ scope_id: string | null; permission_key: string }>
  >`SELECT * FROM app.load_user_memberships(${userId}, ${workspaceId})`;

  // 2. Collect all permission keys across all memberships.
  const permissions = new Set<string>();
  const explicitScopeIds = new Set<string>();
  let hasWorkspaceWideMembership = false;

  for (const row of membershipRows) {
    if (row.scope_id === null) {
      hasWorkspaceWideMembership = true;
    } else {
      explicitScopeIds.add(row.scope_id);
    }

    permissions.add(row.permission_key);
  }

  // 3. Determine accessible scope IDs based on isolation mode.
  let accessibleScopeIds: string[];

  if (hasWorkspaceWideMembership) {
    // User has a workspace-wide membership. Whether this grants
    // access to all scopes depends on the isolation mode.
    const isolationMode = await prisma.$queryRaw<
      Array<{ get_workspace_isolation_mode: string | null }>
    >`SELECT app.get_workspace_isolation_mode(${workspaceId})`;

    const mode = isolationMode[0]?.get_workspace_isolation_mode;

    if (mode === "SOFT") {
      // SOFT mode: workspace-wide membership = access to all scopes.
      // This is the MSP pattern — admins see everything.
      const scopeResult = await prisma.$queryRaw<
        Array<{ get_workspace_scope_ids: string[] }>
      >`SELECT app.get_workspace_scope_ids(${workspaceId})`;

      accessibleScopeIds = scopeResult[0]?.get_workspace_scope_ids ?? [];
    } else {
      // STRICT mode: workspace-wide membership does NOT grant
      // cross-scope access. Only explicitly scoped memberships
      // grant access to their specific scopes.
      // Per Architecture.md §2: "cross-scope reads require
      // explicit, audited elevation."
      accessibleScopeIds = Array.from(explicitScopeIds);
    }
  } else {
    // No workspace-wide membership — only explicitly scoped access.
    accessibleScopeIds = Array.from(explicitScopeIds);
  }

  return {
    permissions,
    accessibleScopeIds,
  };
}
