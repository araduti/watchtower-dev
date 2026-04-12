/**
 * @module @watchtower/db
 *
 * Public API for Watchtower's RLS-aware database layer.
 */

export { prisma, pool } from "./client.ts";
export { withRLS } from "./rls.ts";
export { validateStartupRole } from "./validate.ts";
export { softDeleteExtension } from "./soft-delete.ts";

export type {
  RLSContext,
  PrismaTransactionClient,
  PrismaClient,
  Prisma,
  Sql,
} from "./types.ts";
