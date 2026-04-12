/**
 * @module server/permissions
 *
 * Loads the permission context for an authenticated user in a workspace.
 *
 * This runs BEFORE RLS is configured for the request — it is the bootstrap
 * step that computes which scopes the user can access and which permissions
 * they hold. The results feed into withRLS() and ctx.requirePermission().
 *
 * Uses the singleton prisma client directly (not ctx.db) because ctx.db
 * doesn't exist yet at this point in the middleware chain. The queries
 * here touch Membership, Role, and Permission — global tables that don't
 * have workspace-scoped RLS. The workspace filter is explicit in every query.
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
  // 1. Load all memberships for this user in this workspace,
  //    including their roles and each role's permissions.
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      workspaceId,
    },
    select: {
      scopeId: true,
      roles: {
        select: {
          role: {
            select: {
              permissions: {
                select: {
                  permissionKey: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // 2. Collect all permission keys across all memberships.
  const permissions = new Set<string>();
  const explicitScopeIds = new Set<string>();
  let hasWorkspaceWideMembership = false;

  for (const membership of memberships) {
    if (membership.scopeId === null) {
      hasWorkspaceWideMembership = true;
    } else {
      explicitScopeIds.add(membership.scopeId);
    }

    for (const membershipRole of membership.roles) {
      for (const rolePermission of membershipRole.role.permissions) {
        permissions.add(rolePermission.permissionKey);
      }
    }
  }

  // 3. Determine accessible scope IDs based on isolation mode.
  let accessibleScopeIds: string[];

  if (hasWorkspaceWideMembership) {
    // User has a workspace-wide membership. Whether this grants
    // access to all scopes depends on the isolation mode.
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { scopeIsolationMode: true },
    });

    if (workspace?.scopeIsolationMode === "SOFT") {
      // SOFT mode: workspace-wide membership = access to all scopes.
      // This is the MSP pattern — admins see everything.
      const allScopes = await prisma.scope.findMany({
        where: {
          workspaceId,
          deletedAt: null,
        },
        select: { id: true },
      });
      accessibleScopeIds = allScopes.map((s) => s.id);
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
