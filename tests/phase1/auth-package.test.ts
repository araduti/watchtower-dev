// =============================================================================
// Phase 1.1 — Auth package static validation tests
// =============================================================================
// Validates @watchtower/auth package structure and security invariants
// by reading source files. No database or Better Auth server required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const authSrcDir = join(root, "packages", "auth", "src");

function readSrc(filename: string): string {
  return readFileSync(join(authSrcDir, filename), "utf-8");
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, relativePath), "utf-8"),
  ) as Record<string, unknown>;
}

describe("@watchtower/auth package", () => {
  describe("package structure", () => {
    it("package.json exists and is valid", () => {
      const pkg = readJson("packages/auth/package.json");
      expect(pkg["name"]).toBe("@watchtower/auth");
      expect(pkg["private"]).toBe(true);
    });

    it("tsconfig.json exists", () => {
      expect(
        existsSync(join(root, "packages", "auth", "tsconfig.json")),
      ).toBe(true);
    });

    it("exports resolveSession and auth from index.ts", () => {
      const indexSrc = readSrc("index.ts");
      expect(indexSrc).toContain("resolveSession");
      expect(indexSrc).toContain("auth");
      expect(indexSrc).toContain("ResolvedSession");
    });
  });

  describe("auth.ts — Better Auth configuration", () => {
    const src = readSrc("auth.ts");

    it("uses Better Auth with organization plugin", () => {
      expect(src).toContain("betterAuth");
      expect(src).toContain("organization");
      expect(src).toContain('better-auth/plugins');
    });

    it("uses Prisma adapter from @watchtower/db (not raw pg connection)", () => {
      expect(src).toContain("prismaAdapter");
      expect(src).toContain("@watchtower/db");
      // Verify the adapter is wired into the database config
      expect(src).toMatch(/database:\s*prismaAdapter/);
    });

    it("validates BETTER_AUTH_SECRET is set", () => {
      expect(src).toContain("BETTER_AUTH_SECRET");
      expect(src).toMatch(/if\s*\(\s*!secret\s*\)/);
    });

    it("does NOT reference DATABASE_MIGRATE_URL", () => {
      // Security: auth must never use the migration role
      expect(src).not.toContain("DATABASE_MIGRATE_URL");
    });

    it("disables organization deletion (soft-delete via Watchtower)", () => {
      expect(src).toContain("disableOrganizationDeletion");
    });

    it("uses PostgreSQL provider for the Prisma adapter", () => {
      expect(src).toContain('"postgresql"');
    });
  });

  describe("session.ts — session resolution", () => {
    const src = readSrc("session.ts");

    it("exports resolveSession function", () => {
      expect(src).toContain("export async function resolveSession");
    });

    it("exports ResolvedSession interface", () => {
      expect(src).toContain("export interface ResolvedSession");
      expect(src).toContain("userId");
      expect(src).toContain("workspaceId");
    });

    it("resolves workspace via betterAuthOrgId (not by org ID directly)", () => {
      // The mapping is: Better Auth org ID → Workspace.betterAuthOrgId → Workspace.id
      expect(src).toContain("betterAuthOrgId");
    });

    it("filters soft-deleted workspaces", () => {
      expect(src).toContain("deletedAt");
    });

    it("returns null on auth failure (does not throw)", () => {
      // The catch block returns null — enforceAuth middleware handles the 401
      expect(src).toContain("catch");
      expect(src).toContain("return null");
    });

    it("reads activeOrganizationId from session", () => {
      expect(src).toContain("activeOrganizationId");
    });

    it("does NOT reference DATABASE_MIGRATE_URL", () => {
      expect(src).not.toContain("DATABASE_MIGRATE_URL");
    });
  });
});
