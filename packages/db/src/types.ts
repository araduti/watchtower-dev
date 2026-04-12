/**
 * @module @watchtower/db/types
 *
 * Shared type definitions for the Watchtower database layer.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * The per-request Row-Level Security context.
 */
export interface RLSContext {
  readonly workspaceId: string;
  readonly scopeIds: readonly string[];
}

/**
 * The Prisma client type inside `$transaction()` interactive mode.
 */
export type PrismaTransactionClient = Prisma.TransactionClient;

/** Re-export PrismaClient type. */
export type { PrismaClient };

/** Re-export Prisma namespace. */
export type { Prisma };

/** Prisma.Sql tagged template type for raw queries. */
export type Sql = Prisma.Sql;
