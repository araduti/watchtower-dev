/**
 * Check router — read-only access to the global check catalog.
 *
 * Checks are global (no workspaceId), so RLS does not apply.
 * We use ctx.db for consistency with Non-Negotiable Rule #1
 * — all database access goes through the RLS-scoped transaction client.
 *
 * Cursor-based pagination per API-Conventions.md §9.
 * No soft-delete — checks are never deleted, so no deletedAt filter.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.ts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const severityEnum = z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const sourceEnum = z.enum(["BUILTIN", "PLUGIN"]);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const checkListItem = z.object({
  id: z.string(),
  slug: z.string(),
  version: z.number().int(),
  title: z.string(),
  description: z.string(),
  severity: severityEnum,
  severityRank: z.number().int(),
  source: sourceEnum,
  product: z.string().nullable(),
  createdAt: z.coerce.date(),
});

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  severity: severityEnum.optional(),
  source: sourceEnum.optional(),
});

const listOutput = z.object({
  items: z.array(checkListItem),
  nextCursor: z.string().nullable(),
});

const getInput = z.object({
  checkId: z.string(),
});

const checkDetail = z.object({
  id: z.string(),
  slug: z.string(),
  version: z.number().int(),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  remediation: z.string(),
  severity: severityEnum,
  severityRank: z.number().int(),
  source: sourceEnum,
  pluginRepoId: z.string().nullable(),
  graphScopes: z.array(z.string()),
  dataSource: z.string().nullable(),
  property: z.string().nullable(),
  product: z.string().nullable(),
  connectors: z.array(z.string()),
  createdAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Reusable Prisma selects
// ---------------------------------------------------------------------------

const CHECK_LIST_SELECT = {
  id: true,
  slug: true,
  version: true,
  title: true,
  description: true,
  severity: true,
  severityRank: true,
  source: true,
  product: true,
  createdAt: true,
} as const;

const CHECK_DETAIL_SELECT = {
  id: true,
  slug: true,
  version: true,
  title: true,
  description: true,
  rationale: true,
  remediation: true,
  severity: true,
  severityRank: true,
  source: true,
  pluginRepoId: true,
  graphScopes: true,
  dataSource: true,
  property: true,
  product: true,
  connectors: true,
  createdAt: true,
  // NOTE: allowedValues and allowedOperators are intentionally excluded
  // — they are internal engine details not exposed via the API.
} as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const checkRouter = router({
  /**
   * List checks with cursor-based pagination.
   *
   * Permission: checks:read (no scope — checks are global, BOTH applicability)
   * Optional filters: severity, source
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("checks:read");

      const where: Record<string, unknown> = {};
      if (input.severity) {
        where["severity"] = input.severity;
      }
      if (input.source) {
        where["source"] = input.source;
      }

      // Cursor pagination: fetch limit + 1 to detect next page
      const rows = await ctx.db.check.findMany({
        where,
        orderBy: [{ severityRank: "desc" }, { slug: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: CHECK_LIST_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor =
        hasMore ? (items[items.length - 1]?.id ?? null) : null;

      return { items, nextCursor };
    }),

  /**
   * Get a single check by ID.
   *
   * Permission: checks:read (no scope — checks are global)
   * Returns full check details except internal engine fields
   * (allowedValues, allowedOperators).
   */
  get: protectedProcedure
    .input(getInput)
    .output(checkDetail)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("checks:read");

      const check = await ctx.db.check.findUnique({
        where: { id: input.checkId },
        select: CHECK_DETAIL_SELECT,
      });

      if (!check) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Check not found.",
          cause: { errorCode: "WATCHTOWER:CHECK:NOT_FOUND" },
        });
      }

      return check;
    }),
});
