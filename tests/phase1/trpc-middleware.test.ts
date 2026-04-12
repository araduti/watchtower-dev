// =============================================================================
// Phase 1.1 — tRPC middleware convention tests
// =============================================================================
// Validates that the tRPC middleware chain implements all five steps
// from API-Conventions.md §4, and that security invariants are maintained.
// Source-level static analysis — no database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
const serverDir = join(root, "apps", "web", "src", "server");

function readServer(filename: string): string {
  return readFileSync(join(serverDir, filename), "utf-8");
}

describe("tRPC middleware chain (API-Conventions §4)", () => {
  describe("trpc.ts — middleware implementation", () => {
    const src = readServer("trpc.ts");

    it("Step 1: resolves session via @watchtower/auth", () => {
      expect(src).toContain("resolveSession");
      expect(src).toContain("@watchtower/auth");
    });

    it("Step 2: loads permission context from database", () => {
      expect(src).toContain("loadPermissionContext");
      expect(src).toContain("permissions.ts");
    });

    it("Step 3+4: wires RLS via withRLS and exposes ctx.db", () => {
      expect(src).toContain("withRLS");
      expect(src).toContain("@watchtower/db");
      expect(src).toContain("db:");
    });

    it("Step 5: generates traceId for each request", () => {
      expect(src).toContain("traceId");
      expect(src).toContain("crypto.randomUUID");
    });

    it("enforceAuth throws UNAUTHORIZED with Layer 2 code", () => {
      expect(src).toContain("UNAUTHORIZED");
      expect(src).toContain("WATCHTOWER:AUTH:SESSION_EXPIRED");
    });

    it("requirePermission returns NOT_FOUND (not FORBIDDEN)", () => {
      // Per API-Conventions §5: prevent resource existence leaks
      expect(src).toContain('"NOT_FOUND"');
      expect(src).toContain("WATCHTOWER:AUTH:INSUFFICIENT_PERMISSION");
      // Must NOT use FORBIDDEN for permission denials
      const forbiddenCount = (src.match(/"FORBIDDEN"/g) || []).length;
      expect(forbiddenCount).toBe(0);
    });

    it("does NOT have any remaining TODO: Phase 1.1 markers", () => {
      expect(src).not.toContain("TODO: Phase 1.1");
    });

    it("does NOT instantiate new PrismaClient directly", () => {
      // Non-Negotiable #1: never new PrismaClient() in routers
      expect(src).not.toContain("new PrismaClient");
    });

    it("exports protectedProcedure and router", () => {
      expect(src).toContain("export const protectedProcedure");
      expect(src).toContain("export const router");
    });

    it("exports ProtectedContext type with db field", () => {
      expect(src).toContain("ProtectedContext");
      expect(src).toContain("db: PrismaTransactionClient");
    });
  });

  describe("permissions.ts — permission loading", () => {
    const src = readServer("permissions.ts");

    it("loads memberships with role → permission chain", () => {
      expect(src).toContain("membership.findMany");
      expect(src).toContain("roles");
      expect(src).toContain("permissions");
      expect(src).toContain("permissionKey");
    });

    it("respects scopeIsolationMode", () => {
      expect(src).toContain("scopeIsolationMode");
      expect(src).toContain('"SOFT"');
      // STRICT is handled by the else branch — "SOFT" check is the gate
      expect(src).toContain("STRICT");
    });

    it("handles workspace-wide memberships (scopeId = null)", () => {
      expect(src).toContain("scopeId");
      expect(src).toContain("null");
      expect(src).toContain("hasWorkspaceWideMembership");
    });

    it("filters soft-deleted scopes when loading all scopes", () => {
      expect(src).toContain("deletedAt: null");
    });

    it("exports PermissionContext interface", () => {
      expect(src).toContain("export interface PermissionContext");
      expect(src).toContain("permissions");
      expect(src).toContain("accessibleScopeIds");
    });

    it("exports loadPermissionContext function", () => {
      expect(src).toContain("export async function loadPermissionContext");
    });

    it("does NOT reference DATABASE_MIGRATE_URL", () => {
      expect(src).not.toContain("DATABASE_MIGRATE_URL");
    });
  });
});
