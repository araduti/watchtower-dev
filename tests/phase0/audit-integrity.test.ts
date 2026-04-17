// =============================================================================
// Phase 0 — Audit integrity validation tests
// =============================================================================
// These tests run WITHOUT a database. They parse the migration SQL files
// statically to verify that append-only enforcement, REVOKE statements, and
// guard functions are correctly defined for audit and read-only tables.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Read and concatenate ALL migration SQL files
// ---------------------------------------------------------------------------
const migrationsDir = join(process.cwd(), "prisma", "migrations");
const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let allSql = "";
for (const dir of migrationDirs) {
  const sqlPath = join(migrationsDir, dir, "migration.sql");
  try {
    allSql += readFileSync(sqlPath, "utf-8") + "\n";
  } catch {
    // Not every migration directory has a migration.sql
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Audit integrity — append-only enforcement", () => {
  // -------------------------------------------------------------------------
  // 1. AuditEvent has an append-only trigger
  // -------------------------------------------------------------------------
  it("AuditEvent has an append-only trigger", () => {
    expect(allSql).toMatch(/CREATE TRIGGER audit_event_append_only/);
  });

  // -------------------------------------------------------------------------
  // 2. AuditAccessLog has an append-only trigger
  // -------------------------------------------------------------------------
  it("AuditAccessLog has an append-only trigger", () => {
    expect(allSql).toMatch(/CREATE TRIGGER audit_access_log_append_only/);
  });

  // -------------------------------------------------------------------------
  // 3. Observation has an append-only trigger
  // -------------------------------------------------------------------------
  it("Observation has an append-only trigger", () => {
    expect(allSql).toMatch(/CREATE TRIGGER observation_append_only/);
  });

  // -------------------------------------------------------------------------
  // 4. AuditEvent has REVOKE UPDATE, DELETE
  // -------------------------------------------------------------------------
  it("AuditEvent has REVOKE UPDATE, DELETE from app role", () => {
    expect(allSql).toMatch(
      /REVOKE\s+UPDATE,\s*DELETE,?\s*(?:TRUNCATE\s*)?ON\s+"AuditEvent"\s+FROM\s+watchtower_app/,
    );
  });

  // -------------------------------------------------------------------------
  // 5. AuditAccessLog has REVOKE UPDATE, DELETE
  // -------------------------------------------------------------------------
  it("AuditAccessLog has REVOKE UPDATE, DELETE from app role", () => {
    expect(allSql).toMatch(
      /REVOKE\s+UPDATE,\s*DELETE,?\s*(?:TRUNCATE\s*)?ON\s+"AuditAccessLog"\s+FROM\s+watchtower_app/,
    );
  });

  // -------------------------------------------------------------------------
  // 6. Observation has REVOKE UPDATE, DELETE
  // -------------------------------------------------------------------------
  it("Observation has REVOKE UPDATE, DELETE from app role", () => {
    expect(allSql).toMatch(
      /REVOKE\s+UPDATE,\s*DELETE,?\s*(?:TRUNCATE\s*)?ON\s+"Observation"\s+FROM\s+watchtower_app/,
    );
  });

  // -------------------------------------------------------------------------
  // 7. AuditSigningKey has REVOKE INSERT, UPDATE, DELETE
  // -------------------------------------------------------------------------
  it("AuditSigningKey has REVOKE INSERT, UPDATE, DELETE from app role", () => {
    expect(allSql).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE,?\s*(?:TRUNCATE\s*)?ON\s+"AuditSigningKey"\s+FROM\s+watchtower_app/,
    );
  });

  // -------------------------------------------------------------------------
  // 7b. AuditSigningKey has a SECURITY DEFINER function for registration
  // -------------------------------------------------------------------------
  it("AuditSigningKey has a SECURITY DEFINER function for key registration", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION app\.ensure_signing_key/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION app\.ensure_signing_key\(TEXT,\s*TEXT\) TO watchtower_app/,
    );
  });

  // -------------------------------------------------------------------------
  // 8. Permission, Role, RolePermission are read-only for the app role
  // -------------------------------------------------------------------------
  it("Permission table has REVOKE INSERT, UPDATE, DELETE from app role", () => {
    // The REVOKE statement covers all three tables in one SQL statement:
    // REVOKE INSERT, UPDATE, DELETE ON "Permission", "Role", "RolePermission" FROM watchtower_app;
    expect(allSql).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+"Permission"/,
    );
  });

  it("Role table has REVOKE INSERT, UPDATE, DELETE from app role", () => {
    expect(allSql).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+[^;]*"Role"[^;]*FROM\s+watchtower_app/,
    );
  });

  it("RolePermission table has REVOKE INSERT, UPDATE, DELETE from app role", () => {
    expect(allSql).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+[^;]*"RolePermission"[^;]*FROM\s+watchtower_app/,
    );
  });

  // -------------------------------------------------------------------------
  // 9. The audit_append_only_guard function exists
  // -------------------------------------------------------------------------
  it("audit_append_only_guard function exists", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION app\.audit_append_only_guard/,
    );
  });

  // -------------------------------------------------------------------------
  // 10. The guard function raises an exception
  // -------------------------------------------------------------------------
  it("guard function raises an exception", () => {
    expect(allSql).toMatch(/RAISE EXCEPTION/);
  });
});
