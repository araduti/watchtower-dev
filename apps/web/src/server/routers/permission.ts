/**
 * Permission catalog router — read-only access to the global permission registry.
 *
 * Cursor-based pagination per API-Conventions.md §9.
 *
 * NOTE: The permission table is global (no workspaceId), so RLS does not
 * apply to it. However, per Non-Negotiable Rule #1, we use ctx.db once
 * it exists (Phase 1.1). For now, we use the singleton prisma client
 * because ctx.db is not yet wired in the middleware chain. This is a
 * known Phase 1.0 limitation — the TODO in trpc.ts tracks this.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc.ts";

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  category: z.string().optional(),
});

const permissionOutput = z.object({
  key: z.string(),
  category: z.string(),
  description: z.string(),
  scopeApplicability: z.enum(["WORKSPACE_ONLY", "SCOPE_ONLY", "BOTH"]),
  assignableToCustomRoles: z.boolean(),
});

const listOutput = z.object({
  items: z.array(permissionOutput),
  nextCursor: z.string().nullable(),
});

export const permissionRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("checks:read");

      // TODO: Phase 1.1 — use ctx.db instead of direct prisma import
      // once RLS-aware proxy is wired through the middleware chain.
      // Permission table is global (no RLS), so this is safe for now.
      const { prisma } = await import("@watchtower/db");

      const where: Record<string, unknown> = {};
      if (input.category) {
        where["category"] = input.category;
      }

      // Cursor pagination: fetch limit + 1 to detect next page
      const rows = await prisma.permission.findMany({
        where,
        orderBy: [{ key: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { key: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: {
          key: true,
          category: true,
          description: true,
          scopeApplicability: true,
          assignableToCustomRoles: true,
        },
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor =
        hasMore ? (items[items.length - 1]?.key ?? null) : null;

      return { items, nextCursor };
    }),
});
