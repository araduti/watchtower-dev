// =============================================================================
// Phase 0 — RLS coverage validation tests
// =============================================================================
// These tests run WITHOUT a database. They parse the Prisma schema and
// migration SQL files statically to verify that every workspace-scoped table
// has RLS enabled and forced, and that global tables do NOT have RLS.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Parse the Prisma schema to discover models and their workspaceId fields
// ---------------------------------------------------------------------------
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf-8");

const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
const modelsWithWorkspaceId = new Set<string>();
const allModels = new Set<string>();

let match: RegExpExecArray | null;
while ((match = modelRegex.exec(schema)) !== null) {
  const [, modelName, body] = match;
  allModels.add(modelName!);
  if (/\bworkspaceId\b/.test(body!)) {
    modelsWithWorkspaceId.add(modelName!);
  }
}

// Workspace itself doesn't have a `workspaceId` field — it uses `id`.
// It must still have RLS, so add it to the expected set manually.
const expectedRlsTables = new Set([...modelsWithWorkspaceId, "Workspace"]);

// Tables that should NOT have RLS (no workspaceId, not special-cased)
const tablesWithoutWorkspaceId = [...allModels].filter(
  (m) => !modelsWithWorkspaceId.has(m) && m !== "Workspace",
);

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

// Filter out SQL comments to avoid false positives from commented-out ALTER statements
const activeSql = allSql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

// ---------------------------------------------------------------------------
// Parse which tables have ENABLE / FORCE ROW LEVEL SECURITY
// ---------------------------------------------------------------------------
const enabledRlsTables = new Set<string>();
const forcedRlsTables = new Set<string>();

const enableRegex = /ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g;
const forceRegex = /ALTER TABLE "(\w+)" FORCE ROW LEVEL SECURITY/g;

let m: RegExpExecArray | null;
while ((m = enableRegex.exec(activeSql)) !== null) {
  enabledRlsTables.add(m[1]!);
}
while ((m = forceRegex.exec(activeSql)) !== null) {
  forcedRlsTables.add(m[1]!);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("RLS coverage", () => {
  // Sanity: schema parsing found models
  it("schema parsing found all expected models", () => {
    expect(allModels.size).toBeGreaterThanOrEqual(15);
  });

  // -------------------------------------------------------------------------
  // 1. Every model with workspaceId has RLS enabled
  // -------------------------------------------------------------------------
  describe("every workspace-scoped model has RLS enabled", () => {
    for (const table of expectedRlsTables) {
      it(`${table} has ENABLE ROW LEVEL SECURITY`, () => {
        expect(
          enabledRlsTables.has(table),
          `table "${table}" has workspaceId but no ENABLE ROW LEVEL SECURITY in migrations`,
        ).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 2. Tables WITHOUT workspaceId do NOT have RLS (unless special-cased)
  // -------------------------------------------------------------------------
  describe("global tables do NOT have RLS", () => {
    for (const table of tablesWithoutWorkspaceId) {
      it(`${table} does not have RLS`, () => {
        expect(
          enabledRlsTables.has(table),
          `global table "${table}" should NOT have RLS`,
        ).toBe(false);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 3. Every table with RLS has FORCE ROW LEVEL SECURITY
  // -------------------------------------------------------------------------
  describe("every RLS-enabled table has FORCE ROW LEVEL SECURITY", () => {
    for (const table of enabledRlsTables) {
      it(`${table} has FORCE ROW LEVEL SECURITY`, () => {
        expect(
          forcedRlsTables.has(table),
          `table "${table}" has ENABLE but not FORCE ROW LEVEL SECURITY`,
        ).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 4. No workspace-scoped table is missing from migration coverage
  // -------------------------------------------------------------------------
  it("no workspace-scoped table is missing from migration coverage", () => {
    const missing = [...expectedRlsTables].filter(
      (t) => !enabledRlsTables.has(t),
    );
    expect(
      missing,
      `tables with workspaceId missing RLS: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 5. No unexpected tables have RLS that aren't in the expected set
  // -------------------------------------------------------------------------
  it("no unexpected tables have RLS", () => {
    const extra = [...enabledRlsTables].filter(
      (t) => !expectedRlsTables.has(t),
    );
    expect(
      extra,
      `unexpected tables with RLS: ${extra.join(", ")}`,
    ).toHaveLength(0);
  });
});
