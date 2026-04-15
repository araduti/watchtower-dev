/**
 * Framework router — read-only access to the global compliance framework
 * catalog (CIS, NIST, etc.).
 *
 * Frameworks are global (no workspaceId), so RLS does not apply.
 * We use ctx.db for consistency with Non-Negotiable Rule #1
 * — all database access goes through the RLS-scoped transaction client.
 *
 * Cursor-based pagination per API-Conventions.md §9.
 * No soft-delete — frameworks are never deleted, so no deletedAt filter.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const frameworkOutput = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  publisher: z.string(),
  version: z.string(),
  url: z.string().nullable(),
  createdAt: z.coerce.date(),
});

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const listOutput = z.object({
  items: z.array(frameworkOutput),
  nextCursor: z.string().nullable(),
});

const getInput = z.object({
  frameworkId: z.string(),
});

// ---------------------------------------------------------------------------
// Reusable Prisma select
// ---------------------------------------------------------------------------

const FRAMEWORK_SELECT = {
  id: true,
  slug: true,
  name: true,
  publisher: true,
  version: true,
  url: true,
  createdAt: true,
} as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const frameworkRouter = router({
  /**
   * List compliance frameworks with cursor-based pagination.
   *
   * Permission: frameworks:read (no scope — frameworks are global)
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("frameworks:read");

      // Cursor pagination: fetch limit + 1 to detect next page
      const rows = await ctx.db.framework.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: FRAMEWORK_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor =
        hasMore ? (items[items.length - 1]?.id ?? null) : null;

      return { items, nextCursor };
    }),

  /**
   * Get a single compliance framework by ID.
   *
   * Permission: frameworks:read (no scope — frameworks are global)
   */
  get: protectedProcedure
    .input(getInput)
    .output(frameworkOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("frameworks:read");

      const framework = await ctx.db.framework.findUnique({
        where: { id: input.frameworkId },
        select: FRAMEWORK_SELECT,
      });

      if (!framework) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Framework not found.",
          cause: { errorCode: "WATCHTOWER:FRAMEWORK:NOT_FOUND" },
        });
      }

      return framework;
    }),
});
