/**
 * @module server/trpc
 *
 * tRPC v11 initialization and middleware chain for Watchtower.
 *
 * Middleware chain (API-Conventions.md §4):
 * 1. Resolve session → userId + workspaceId
 * 2. Load permission context (cached per request)
 * 3. SET LOCAL for Postgres RLS session variables
 * 4. Construct RLS-aware Prisma proxy as ctx.db
 * 5. Thread traceId through logs, Inngest, audit
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { resolveSession } from "@watchtower/auth";
import type { PrismaTransactionClient } from "@watchtower/db";
import { withRLS } from "@watchtower/db";
import { loadPermissionContext } from "./permissions.ts";
import type { PermissionContext } from "./permissions.ts";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface TRPCContext {
  session: {
    userId: string;
    workspaceId: string;
  } | null;
}

export async function createTRPCContext(opts: {
  headers: Headers;
}): Promise<TRPCContext> {
  const session = await resolveSession(opts.headers);
  return { session };
}

// ---------------------------------------------------------------------------
// tRPC initialization
// ---------------------------------------------------------------------------

const t = initTRPC.context<TRPCContext>().create({
  // superjson transformer deferred until @trpc/client is wired
});

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session expired. Please re-authenticate.",
      cause: { errorCode: "WATCHTOWER:AUTH:SESSION_EXPIRED" },
    });
  }
  return next({
    ctx: { session: ctx.session },
  });
});

// ---------------------------------------------------------------------------
// Permission context
// ---------------------------------------------------------------------------

/**
 * Create a permission checker that returns NOT_FOUND (not FORBIDDEN)
 * to prevent resource existence leaks. Per API-Conventions.md §5.
 */
function createRequirePermission(permCtx: PermissionContext) {
  return async function requirePermission(
    permission: string,
    opts?: { scopeId?: string },
  ): Promise<void> {
    if (!permCtx.permissions.has(permission)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Resource not found.",
        cause: { errorCode: "WATCHTOWER:AUTH:INSUFFICIENT_PERMISSION" },
      });
    }

    if (opts?.scopeId && !permCtx.accessibleScopeIds.includes(opts.scopeId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Resource not found.",
        cause: { errorCode: "WATCHTOWER:AUTH:INSUFFICIENT_PERMISSION" },
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Protected procedure — loads permissions and wires RLS
// ---------------------------------------------------------------------------

/**
 * Extended context exposed to protected procedures.
 *
 * `db` is an RLS-scoped Prisma transaction client. All database access
 * inside procedures MUST go through `ctx.db` — never the singleton client.
 */
export interface ProtectedContext {
  session: { userId: string; workspaceId: string };
  requirePermission: (
    permission: string,
    opts?: { scopeId?: string },
  ) => Promise<void>;
  permissionContext: PermissionContext;
  traceId: string;
  db: PrismaTransactionClient;
}

const protectedMiddleware = t.middleware(async ({ ctx, next }) => {
  const session = ctx.session as { userId: string; workspaceId: string };

  // Step 2: Load permission context from database
  // Queries Membership → MembershipRole → Role → RolePermission → Permission
  // Respects scopeIsolationMode (SOFT vs STRICT) per Architecture.md §2
  const permCtx = await loadPermissionContext(
    session.userId,
    session.workspaceId,
  );

  const traceId = crypto.randomUUID();

  // Step 3+4: Wire RLS session variables and expose ctx.db
  // withRLS() sets SET LOCAL for workspace/scope context,
  // completing the three-layer isolation chain:
  //   Layer 1: ctx.requirePermission (application check)
  //   Layer 2: explicit WHERE filters in router queries
  //   Layer 3: Postgres RLS via SET LOCAL (safety net)
  //
  // If the user has no accessible scopes, we still need to proceed
  // (they may be calling workspace-level procedures). In that case,
  // we pass a sentinel scope ID that will match nothing in RLS,
  // ensuring workspace-level procedures work but scope-level data
  // is invisible.
  const scopeIds =
    permCtx.accessibleScopeIds.length > 0
      ? permCtx.accessibleScopeIds
      : ["__no_scope_access__"];

  return withRLS(session.workspaceId, scopeIds, async (tx) => {
    return next({
      ctx: {
        session,
        requirePermission: createRequirePermission(permCtx),
        permissionContext: permCtx,
        traceId,
        db: tx,
      },
    });
  });
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure
  .use(enforceAuth)
  .use(protectedMiddleware);
export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
