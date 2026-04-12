/**
 * @module @watchtower/db/client
 *
 * Singleton PrismaClient factory for Watchtower's runtime database access.
 *
 * Security model:
 * - Connects as `watchtower_app` (NOBYPASSRLS) via DATABASE_URL
 * - NEVER uses DATABASE_MIGRATE_URL — that role bypasses RLS
 * - Pool sized for single-NUC deployment (max: 10)
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error(
    "[watchtower/db] DATABASE_URL is not set. " +
      "The application cannot start without a database connection string. " +
      "This should point to the watchtower_app role (NOBYPASSRLS). " +
      "Never use DATABASE_MIGRATE_URL here — that role bypasses Row-Level Security.",
  );
}

// ---------------------------------------------------------------------------
// pg.Pool — the raw PostgreSQL connection pool
// ---------------------------------------------------------------------------

/**
 * The raw `pg.Pool` instance used by the Prisma adapter.
 *
 * Exported for:
 * 1. `validateStartupRole()` — introspection queries against pg_roles
 * 2. Future health-check endpoints (`pool.totalCount`, etc.)
 *
 * Do NOT use this for application queries — use `prisma` with `withRLS()`.
 */
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// ---------------------------------------------------------------------------
// PrismaClient singleton
// ---------------------------------------------------------------------------

const adapter = new PrismaPg(pool);

/**
 * Singleton PrismaClient for all runtime database access.
 *
 * Connects as `watchtower_app` (NOBYPASSRLS). All workspace-scoped queries
 * MUST go through `withRLS()` to set session variables that RLS policies
 * depend on.
 */
export const prisma = new PrismaClient({ adapter });
