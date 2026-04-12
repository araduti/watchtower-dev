/**
 * @module @watchtower/auth/session
 *
 * Resolves Better Auth sessions from HTTP request headers.
 *
 * Used by tRPC's `createTRPCContext` to extract userId and workspaceId
 * from the authenticated session. Returns null for unauthenticated
 * requests — the tRPC `enforceAuth` middleware handles the 401.
 *
 * The workspaceId is resolved from the active organization:
 * Better Auth Organization.id → Workspace.betterAuthOrgId → Workspace.id
 *
 * This mapping is necessary because Better Auth's Organization IDs are
 * not the same as Watchtower's Workspace CUIDs. The session carries
 * the Better Auth org ID; we translate it to Watchtower's workspace ID.
 */

import { auth } from "./auth.ts";

export interface ResolvedSession {
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * Resolve the Better Auth session from request headers.
 *
 * @returns The resolved session with userId and workspaceId, or null
 *          if unauthenticated or no active organization is set.
 */
export async function resolveSession(
  headers: Headers,
): Promise<ResolvedSession | null> {
  try {
    const session = await auth.api.getSession({
      headers,
    });

    if (!session?.session?.userId) {
      return null;
    }

    // The active organization ID comes from the organization plugin.
    // When a user selects a workspace in the UI, they call
    // `setActiveOrganization`, which stores the org ID in the session.
    const activeOrgId = (session.session as Record<string, unknown>)[
      "activeOrganizationId"
    ] as string | undefined;

    if (!activeOrgId) {
      return null;
    }

    // Resolve workspace ID from Better Auth org ID.
    // This import is deferred to avoid circular dependencies
    // between @watchtower/auth and @watchtower/db at module load time.
    const { prisma } = await import("@watchtower/db");

    const workspace = await prisma.workspace.findUnique({
      where: { betterAuthOrgId: activeOrgId },
      select: { id: true, deletedAt: true },
    });

    // Soft-deleted or nonexistent workspace → treat as no workspace
    if (!workspace || workspace.deletedAt !== null) {
      return null;
    }

    return {
      userId: session.session.userId,
      workspaceId: workspace.id,
    };
  } catch {
    // Auth resolution failures are not exceptional — cookie expired,
    // malformed token, etc. Return null and let enforceAuth handle it.
    return null;
  }
}
