// =============================================================================
// Phase 1.2 — Idempotency module convention tests
// =============================================================================
// Validates the idempotency middleware follows API-Conventions.md §8.
// Source-level static analysis — no database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), "utf-8");
}

describe("Idempotency module (API-Conventions §8)", () => {
  const src = readFile("apps/web/src/server/idempotency.ts");

  describe("exports", () => {
    it("exports checkIdempotencyKey function", () => {
      expect(src).toContain("export async function checkIdempotencyKey");
    });

    it("exports saveIdempotencyResult function", () => {
      expect(src).toContain("export async function saveIdempotencyResult");
    });

    it("exports computeRequestHash function", () => {
      expect(src).toContain("export function computeRequestHash");
    });
  });

  describe("checkIdempotencyKey behavior", () => {
    it("looks up by workspaceId + key composite", () => {
      expect(src).toContain("workspaceId_key");
    });

    it("compares requestHash for misuse detection", () => {
      expect(src).toContain("requestHash");
      expect(src).toContain("existing.requestHash !== requestHash");
    });

    it("throws DUPLICATE_IDEMPOTENCY_KEY on hash mismatch", () => {
      expect(src).toContain("DUPLICATE_IDEMPOTENCY_KEY");
      expect(src).toContain("throwWatchtowerError");
    });

    it("returns null for new requests", () => {
      expect(src).toContain("return null");
    });

    it("returns cached response for replay", () => {
      expect(src).toContain("responseBody");
      expect(src).toContain("statusCode");
    });
  });

  describe("saveIdempotencyResult behavior", () => {
    it("skips 5xx responses (allows retry)", () => {
      expect(src).toContain("statusCode >= 500");
      // Must return early — not cache 5xx
      expect(src).toContain("return;");
    });

    it("uses upsert for race-condition safety", () => {
      expect(src).toContain("upsert");
    });
  });

  describe("computeRequestHash behavior", () => {
    it("excludes idempotencyKey from hash", () => {
      expect(src).toContain("idempotencyKey");
      // Destructuring to remove the key
      expect(src).toContain("_omitted");
    });

    it("uses SHA-256", () => {
      expect(src).toContain("sha256");
      expect(src).toContain("createHash");
    });

    it("sorts keys for deterministic hashing", () => {
      expect(src).toContain("sort");
    });
  });

  describe("security", () => {
    it("uses PrismaTransactionClient (not raw prisma)", () => {
      expect(src).toContain("PrismaTransactionClient");
      expect(src).not.toContain("import { prisma }");
    });

    it("uses @watchtower/errors for error codes", () => {
      expect(src).toContain("@watchtower/errors");
      expect(src).toContain("WATCHTOWER_ERRORS");
    });

    it("does NOT instantiate new PrismaClient", () => {
      expect(src).not.toContain("new PrismaClient");
    });
  });
});

describe("Workspace router idempotency integration", () => {
  const src = readFile("apps/web/src/server/routers/workspace.ts");

  it("imports idempotency functions", () => {
    expect(src).toContain("checkIdempotencyKey");
    expect(src).toContain("saveIdempotencyResult");
    expect(src).toContain("computeRequestHash");
  });

  it("calls checkIdempotencyKey before permission check in updateSettings", () => {
    // Look within the updateSettings mutation body, not the whole file
    const updateIdx = src.indexOf("updateSettings:");
    const afterUpdate = src.substring(updateIdx);
    const checkIdx = afterUpdate.indexOf("checkIdempotencyKey");
    const permIdx = afterUpdate.indexOf("ctx.requirePermission");
    // Idempotency check must come before permission check within the mutation
    expect(checkIdx).toBeGreaterThan(-1);
    expect(permIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeLessThan(permIdx);
  });

  it("calls saveIdempotencyResult after successful mutation", () => {
    expect(src).toContain("saveIdempotencyResult");
  });

  it("returns cached response on idempotency hit", () => {
    expect(src).toContain("cached.responseBody");
  });
});
