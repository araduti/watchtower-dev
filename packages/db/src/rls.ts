/**
 * @module @watchtower/db/rls
 *
 * Per-request Row-Level Security context for Watchtower.
 *
 * Uses SET LOCAL to scope RLS session variables to the current transaction.
 * SET LOCAL (not SET) is critical: variables are cleared when the transaction
 * ends, so they NEVER leak across pooled connections.
 */

import { prisma } from "./client.ts";
import type { PrismaTransactionClient } from "./types.ts";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const SAFE_IDENTIFIER = /^[\w-]+$/;

/**
 * Validates a value is safe to interpolate into SET LOCAL.
 * Defense-in-depth against SQL injection in workspace/scope IDs.
 */
function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(
      `[watchtower/db] Invalid ${label}: "${value}". ` +
        `Only alphanumeric characters, underscores, and hyphens are allowed.`,
    );
  }
}

// ---------------------------------------------------------------------------
// withRLS
// ---------------------------------------------------------------------------

/**
 * Execute a callback inside a Prisma interactive transaction with RLS
 * session variables set for the given workspace and scopes.
 *
 * @param workspaceId - The workspace CUID (from authenticated session)
 * @param scopeIds - Scope CUIDs the current user can access (from session)
 * @param fn - Callback receiving the transaction client with RLS enforced
 */
export async function withRLS<T>(
  workspaceId: string,
  scopeIds: readonly string[],
  fn: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  if (!workspaceId) {
    throw new Error(
      "[watchtower/db] withRLS() called with empty workspaceId. " +
        "Every workspace-scoped operation requires a workspace identifier.",
    );
  }

  if (scopeIds.length === 0) {
    throw new Error(
      "[watchtower/db] withRLS() called with empty scopeIds array. " +
        "The user must have access to at least one scope.",
    );
  }

  assertSafeIdentifier(workspaceId, "workspaceId");
  for (const scopeId of scopeIds) {
    assertSafeIdentifier(scopeId, "scopeId");
  }

  return prisma.$transaction(async (tx) => {
    // SET LOCAL scopes variables to this transaction only.
    // They are automatically cleared on commit/rollback — never leak
    // across pooled connections even when pg.Pool reuses a connection.
    const scopeIdList = scopeIds.join(",");

    await tx.$executeRaw`SET LOCAL app.current_workspace_id = ${workspaceId}`;
    await tx.$executeRaw`SET LOCAL app.current_user_scope_ids = ${scopeIdList}`;

    return fn(tx);
  });
}
