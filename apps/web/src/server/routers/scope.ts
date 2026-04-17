/**
 * Scope router — manage scopes within the current workspace.
 *
 * Scopes are the isolation boundary in Watchtower's hierarchy:
 * Workspace → Scope → Tenant. A Scope is where RBAC and data
 * isolation actually live.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before any data access (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #6, API-Conventions §9)
 * - Allowlisted filters (Non-Negotiable #10, API-Conventions §10)
 * - deletedAt: null filter (Non-Negotiable #7)
 * - Scope derived from resource, not from input (API-Conventions §5)
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 * - Audit log in same transaction as mutation (Code-Conventions §1)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import { createAuditEvent } from "@watchtower/db";
import { throwWatchtowerError } from "../errors.ts";
import {
  checkIdempotencyKey,
  saveIdempotencyResult,
  computeRequestHash,
} from "../idempotency.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const scopeOutput = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentScopeId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const listOutput = z.object({
  items: z.array(scopeOutput),
  nextCursor: z.string().nullable(),
});

const getInput = z.object({
  scopeId: z.string(),
});

// -- create --
const createInput = z.object({
  idempotencyKey: z.string().uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug must be lowercase alphanumeric with hyphens (e.g. 'my-scope').",
  }),
  parentScopeId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createOutput = scopeOutput;

/**
 * Reusable Prisma select clause for scope queries.
 */
const SCOPE_SELECT = {
  id: true,
  name: true,
  slug: true,
  parentScopeId: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const scopeRouter = router({
  /**
   * List scopes in the current workspace.
   *
   * Permission: scopes:read (no scope — the query itself filters by
   * accessible scopes via RLS and explicit WHERE)
   *
   * Per API-Conventions §5: "For list, the check is
   * ctx.requirePermission('...') (no scope), then the SQL query
   * filters by scopeId IN (user's accessible scopes)."
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("scopes:read");

      // Layer 2 (explicit SQL filter): restrict to accessible scopes.
      // Layer 3 (RLS) is the safety net via ctx.db.
      const rows = await ctx.db.scope.findMany({
        where: {
          workspaceId: ctx.session.workspaceId,
          id: { in: ctx.permissionContext.accessibleScopeIds },
          deletedAt: null,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: SCOPE_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

      return {
        items: items.map((item) => ({
          ...item,
          metadata: item.metadata as Record<string, unknown>,
        })),
        nextCursor,
      };
    }),

  /**
   * Get a single scope by ID.
   *
   * Permission: scopes:read, scoped to the target scope.
   * Per API-Conventions §5: "The scope is derived from the resource,
   * not from input." Here the resource IS the scope, so scopeId
   * from input is used for the permission check.
   */
  get: protectedProcedure
    .input(getInput)
    .output(scopeOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first
      const scope = await ctx.db.scope.findFirst({
        where: {
          id: input.scopeId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: SCOPE_SELECT,
      });

      if (!scope) {
        throwWatchtowerError(WATCHTOWER_ERRORS.SCOPE.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      // Scope derived from resource — the resource IS the scope
      await ctx.requirePermission("scopes:read", { scopeId: scope.id });

      return {
        ...scope,
        metadata: scope.metadata as Record<string, unknown>,
      };
    }),

  /**
   * Create a new scope in the current workspace.
   *
   * Permission: scopes:create (workspace-level, no scope).
   * Audit: scope.create logged with scope details.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   *
   * Guard: rejects if the slug is already taken within the workspace.
   */
  create: protectedProcedure
    .input(createInput)
    .output(createOutput)
    .mutation(async ({ input, ctx }) => {
      // Idempotency check (API-Conventions §8)
      const requestHash = computeRequestHash(input as Record<string, unknown>);
      const cached = await checkIdempotencyKey(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
      );
      if (cached) {
        return cached.responseBody as z.infer<typeof createOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("scopes:create");

      // Check for duplicate slug within the workspace
      const duplicate = await ctx.db.scope.findFirst({
        where: {
          workspaceId: ctx.session.workspaceId,
          slug: input.slug,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (duplicate) {
        throwWatchtowerError(WATCHTOWER_ERRORS.SCOPE.SLUG_TAKEN);
      }

      // If parentScopeId is provided, verify it exists in this workspace
      if (input.parentScopeId) {
        const parentScope = await ctx.db.scope.findFirst({
          where: {
            id: input.parentScopeId,
            workspaceId: ctx.session.workspaceId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!parentScope) {
          throwWatchtowerError(WATCHTOWER_ERRORS.SCOPE.NOT_FOUND, {
            message: "Parent scope not found.",
          });
        }
      }

      // Create scope and write audit log in the same transaction.
      // ctx.db is already inside a withRLS() transaction, so both
      // operations share the same transaction boundary.
      const created = await ctx.db.scope.create({
        data: {
          workspaceId: ctx.session.workspaceId,
          name: input.name,
          slug: input.slug,
          parentScopeId: input.parentScopeId ?? null,
          metadata: input.metadata ?? {},
        },
        select: SCOPE_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: created.id,
        eventType: "scope.create",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Scope",
        targetId: created.id,
        eventData: {
          name: input.name,
          slug: input.slug,
          parentScopeId: input.parentScopeId ?? null,
        },
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      const result = {
        ...created,
        metadata: created.metadata as Record<string, unknown>,
      };

      await saveIdempotencyResult(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
        result,
        200,
      );

      return result;
    }),
});
