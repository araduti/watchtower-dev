/**
 * @module @watchtower/db/validate
 *
 * Startup validation for Watchtower's database connection.
 *
 * Runs ONCE at application startup to verify:
 * 1. Connected as `watchtower_app` (not `watchtower_migrate`)
 * 2. The role does NOT have BYPASSRLS
 *
 * If either check fails, the application MUST NOT start — connecting as the
 * migration role would silently bypass all Row-Level Security policies,
 * destroying multi-tenant isolation.
 *
 * Per Architecture.md §6 and Code-Conventions.md §3.
 */

import { pool } from "./client.ts";

interface CurrentUserRow {
  current_user: string;
}

interface RolBypassRLSRow {
  rolbypassrls: boolean;
}

/**
 * Validates the database connection uses `watchtower_app` without BYPASSRLS.
 * Call once at startup before serving any requests.
 *
 * @throws {Error} If the role is wrong or has BYPASSRLS.
 */
export async function validateStartupRole(): Promise<void> {
  const client = await pool.connect();

  try {
    // Check 1: Verify role name
    const userResult = await client.query<CurrentUserRow>(
      "SELECT current_user",
    );
    const currentUser = userResult.rows[0]?.current_user;

    if (currentUser !== "watchtower_app") {
      throw new Error(
        `[watchtower/db] FATAL: Connected as "${currentUser ?? "unknown"}" ` +
          `but expected "watchtower_app". ` +
          "Check your DATABASE_URL — it may be pointing at DATABASE_MIGRATE_URL.",
      );
    }

    // Check 2: Verify no BYPASSRLS
    const rlsResult = await client.query<RolBypassRLSRow>(
      "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    const rolBypassRLS = rlsResult.rows[0]?.rolbypassrls;

    if (rolBypassRLS === undefined) {
      throw new Error(
        `[watchtower/db] FATAL: Role "${currentUser}" not found in pg_roles.`,
      );
    }

    if (rolBypassRLS) {
      throw new Error(
        `[watchtower/db] FATAL: Role "${currentUser}" has BYPASSRLS enabled. ` +
          "The application role must NOT have BYPASSRLS.",
      );
    }
  } finally {
    client.release();
  }
}
