// =============================================================================
// Phase 1.2 — Startup role validation tests
// =============================================================================
// Validates that the startup role validation module exists, is exported,
// and follows the security requirements from Architecture.md §6.
// Source-level static analysis — no database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), "utf-8");
}

describe("Startup role validation (Architecture.md §6)", () => {
  const src = readFile("packages/db/src/validate.ts");

  describe("role validation logic", () => {
    it("checks current_user against watchtower_app", () => {
      expect(src).toContain("current_user");
      expect(src).toContain("watchtower_app");
    });

    it("rejects watchtower_migrate role", () => {
      // The error message should reference the wrong role
      expect(src).toContain("watchtower_app");
      expect(src).toContain("DATABASE_MIGRATE_URL");
    });

    it("checks BYPASSRLS flag", () => {
      expect(src).toContain("rolbypassrls");
      expect(src).toContain("BYPASSRLS");
    });

    it("uses pool.connect() for introspection", () => {
      expect(src).toContain("pool.connect");
    });

    it("releases connection in finally block", () => {
      expect(src).toContain("finally");
      expect(src).toContain("client.release()");
    });

    it("throws Error with FATAL prefix for security violations", () => {
      expect(src).toContain("FATAL");
    });
  });

  describe("@watchtower/db exports", () => {
    const indexSrc = readFile("packages/db/src/index.ts");

    it("exports validateStartupRole function", () => {
      expect(indexSrc).toContain("validateStartupRole");
    });
  });
});
