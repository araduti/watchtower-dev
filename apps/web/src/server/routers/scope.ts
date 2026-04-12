/**
 * Scope router — list and read scopes within the current workspace.
 *
 * Scopes are the isolation boundary in Watchtower's hierarchy:
 * Workspace → Scope → Tenant. A Scope is where RBAC and data
 * isolation actually live.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - ctx.requirePermission before any data access (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #6, API-Conventions §9)
 * - Allowlisted filters (Non-Negotiable #10, API-Conventions §10)
 * - deletedAt: null filter (Non-Negotiable #7)
 * - Scope derived from resource, not from input (API-Conventions §5)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import { throwWatchtowerError } from "../errors.ts";

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
        select: {
          id: true,
          name: true,
          slug: true,
          parentScopeId: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
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
        select: {
          id: true,
          name: true,
          slug: true,
          parentScopeId: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
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
});
