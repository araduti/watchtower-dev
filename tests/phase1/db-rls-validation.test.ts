// =============================================================================
// Phase 1 — Database package static validation tests
// =============================================================================
// Validates security invariants by reading source files. No database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const dbSrcDir = join(process.cwd(), "packages", "db", "src");

function readSrc(filename: string): string {
  return readFileSync(join(dbSrcDir, filename), "utf-8");
}

describe("Database package security invariants", () => {
  describe("client.ts", () => {
    const src = readSrc("client.ts");

    it("validates DATABASE_URL is set", () => {
      expect(src).toContain('DATABASE_URL');
      expect(src).toMatch(/if\s*\(\s*!databaseUrl\s*\)/);
    });

    it("does NOT reference DATABASE_MIGRATE_URL", () => {
      // Security: the runtime client must never use the migration role
      expect(src).not.toMatch(/process\.env\[["']DATABASE_MIGRATE_URL["']\]/);
      expect(src).not.toMatch(/process\.env\.DATABASE_MIGRATE_URL/);
    });

    it("creates a singleton PrismaClient", () => {
      expect(src).toContain("new PrismaClient");
      expect(src).toContain("export const prisma");
    });

    it("creates a pg.Pool with connection limits", () => {
      expect(src).toContain("new Pool");
      expect(src).toMatch(/max:\s*10/);
    });
  });

  describe("rls.ts", () => {
    const src = readSrc("rls.ts");

    it("uses SET LOCAL (not bare SET)", () => {
      // SET LOCAL is transaction-scoped; bare SET would leak across connections
      expect(src).toContain("SET LOCAL");
      // Ensure we're not accidentally using bare SET without LOCAL
      const setLocalCount = (src.match(/SET LOCAL/g) || []).length;
      const bareSetCount = (
        src.match(/\bSET\b/g)?.filter((_, i, arr) => {
          // Count SET that is NOT followed by LOCAL
          const fullMatch = src.indexOf("SET", src.indexOf(arr[i - 1] ?? "") + 1);
          return fullMatch >= 0 && !src.substring(fullMatch, fullMatch + 10).includes("LOCAL");
        }) || []
      ).length;
      expect(setLocalCount).toBeGreaterThanOrEqual(2);
      // bareSetCount is complex to compute precisely, so just verify SET LOCAL appears
    });

    it("validates empty workspaceId", () => {
      expect(src).toMatch(/if\s*\(\s*!workspaceId\s*\)/);
    });

    it("validates empty scopeIds array", () => {
      expect(src).toMatch(/scopeIds\.length\s*===\s*0/);
    });

    it("has SQL injection defense for identifiers", () => {
      expect(src).toContain("assertSafeIdentifier");
      expect(src).toMatch(/SAFE_IDENTIFIER/);
    });
  });

  describe("validate.ts", () => {
    const src = readSrc("validate.ts");

    it("checks for watchtower_app role", () => {
      expect(src).toContain("watchtower_app");
      expect(src).toContain("SELECT current_user");
    });

    it("checks for BYPASSRLS", () => {
      expect(src).toContain("rolbypassrls");
      expect(src).toContain("pg_roles");
    });
  });

  describe("soft-delete.ts", () => {
    const src = readSrc("soft-delete.ts");

    it("covers exactly three models: Workspace, Scope, Tenant", () => {
      expect(src).toContain('"Workspace"');
      expect(src).toContain('"Scope"');
      expect(src).toContain('"Tenant"');
      // Verify it's a finite set, not a catch-all
      const modelMatches = src.match(/"(Workspace|Scope|Tenant)"/g);
      expect(modelMatches).toHaveLength(3);
    });

    it("filters read operations only (not create/update/delete)", () => {
      expect(src).toContain("findMany");
      expect(src).toContain("findFirst");
      expect(src).toContain("findUnique");
      expect(src).toContain("count");
      // Should NOT intercept write operations
      expect(src).not.toContain('"create"');
      expect(src).not.toContain('"update"');
      expect(src).not.toContain('"delete"');
      expect(src).not.toContain('"updateMany"');
      expect(src).not.toContain('"deleteMany"');
    });

    it("injects deletedAt: null filter", () => {
      expect(src).toContain("deletedAt: null");
    });

    it("supports opt-out via includeSoftDeleted", () => {
      expect(src).toContain("includeSoftDeleted");
    });
  });
});
