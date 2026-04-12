/**
 * @module @watchtower/db/soft-delete
 *
 * Prisma client extension that automatically adds `deletedAt: null` to
 * read queries on Workspace, Scope, and Tenant — the three soft-delete
 * models in Watchtower.
 *
 * Per Code-Conventions.md §2: "The Prisma middleware adds this filter
 * by default."
 *
 * Opt out for archival queries: `{ includeSoftDeleted: true }`.
 */

import { Prisma } from "@prisma/client";

const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set([
  "Workspace",
  "Scope",
  "Tenant",
]);

const FILTERED_OPERATIONS: ReadonlySet<string> = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
]);

/**
 * Prisma extension that auto-filters soft-deleted records.
 *
 * Usage:
 * ```ts
 * const prisma = new PrismaClient().$extends(softDeleteExtension);
 * ```
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: "watchtower-soft-delete",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (
          !model ||
          !SOFT_DELETE_MODELS.has(model) ||
          !FILTERED_OPERATIONS.has(operation)
        ) {
          return query(args);
        }

        const argsRecord = args as Record<string, unknown>;
        if (argsRecord["includeSoftDeleted"] === true) {
          const { includeSoftDeleted: _, ...cleanArgs } = argsRecord;
          return query(cleanArgs);
        }

        const where =
          (argsRecord["where"] as Record<string, unknown> | undefined) ?? {};

        return query({
          ...args,
          where: {
            ...where,
            deletedAt: null,
          },
        });
      },
    },
  },
});
