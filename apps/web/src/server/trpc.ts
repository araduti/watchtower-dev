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

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface TRPCContext {
  session: {
    userId: string;
    workspaceId: string;
  } | null;
}

export async function createTRPCContext(_opts: {
  headers: Headers;
}): Promise<TRPCContext> {
  // TODO: Phase 1.1 — resolve Better Auth session from cookies/headers
  return { session: null };
}

// ---------------------------------------------------------------------------
// tRPC initialization
// ---------------------------------------------------------------------------

const t = initTRPC.context<TRPCContext>().create({
  // TODO: add superjson transformer once @trpc/client is wired
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

interface PermissionContext {
  permissions: Set<string>;
  accessibleScopeIds: string[];
}

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
// Protected procedure
// ---------------------------------------------------------------------------

const protectedMiddleware = t.middleware(async ({ ctx, next }) => {
  const session = ctx.session as { userId: string; workspaceId: string };

  // TODO: Phase 1.1 — load from database via Membership → Role → Permission
  const permCtx: PermissionContext = {
    permissions: new Set<string>(),
    accessibleScopeIds: [],
  };

  const traceId = crypto.randomUUID();

  return next({
    ctx: {
      session,
      requirePermission: createRequirePermission(permCtx),
      permissionContext: permCtx,
      traceId,
    },
  });
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure
  .use(enforceAuth)
  .use(protectedMiddleware);
export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
