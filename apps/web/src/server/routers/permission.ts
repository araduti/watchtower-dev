/**
 * Permission catalog router — read-only access to the global permission registry.
 *
 * Cursor-based pagination per API-Conventions.md §9.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc.ts";
import { prisma } from "@watchtower/db";

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
