// =============================================================================
// Phase 1.2 — Updated middleware chain tests
// =============================================================================
// Validates that the tRPC middleware chain now includes Phase 1.2 features:
// rate limiting, idempotency support, and audit chain integration.
// Source-level static analysis — no database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), "utf-8");
}

describe("Phase 1.2 middleware chain updates", () => {
  const trpcSrc = readFile("apps/web/src/server/trpc.ts");

  describe("rate limiting in middleware", () => {
    it("imports rate limiting from rate-limit module", () => {
      expect(trpcSrc).toContain("./rate-limit.ts");
    });

    it("imports WATCHTOWER_ERRORS for rate limit errors", () => {
      expect(trpcSrc).toContain("@watchtower/errors");
      expect(trpcSrc).toContain("WATCHTOWER_ERRORS");
    });

    it("imports throwWatchtowerError for consistent error handling", () => {
      expect(trpcSrc).toContain("throwWatchtowerError");
      expect(trpcSrc).toContain("./errors.ts");
    });

    it("checks rate limit before loading permission context in middleware body", () => {
      // Look within the protectedMiddleware, not the import section
      const middlewareStart = trpcSrc.indexOf("const protectedMiddleware");
      const middlewareBody = trpcSrc.substring(middlewareStart);
      const rlIdx = middlewareBody.indexOf("checkRateLimit");
      const permIdx = middlewareBody.indexOf("loadPermissionContext");
      expect(rlIdx).toBeGreaterThan(-1);
      expect(permIdx).toBeGreaterThan(-1);
      // Rate limit should be checked before loading permissions (cheaper first)
      expect(rlIdx).toBeLessThan(permIdx);
    });

    it("uses type parameter to determine mutation vs query tier", () => {
      expect(trpcSrc).toContain("type");
      // Should check if type === "mutation" for mutation tier
      expect(trpcSrc).toContain('"mutation"');
      expect(trpcSrc).toContain('"query"');
    });

    it("constructs rate limit key from userId and workspaceId", () => {
      // Key format: ${userId}:${workspaceId}
      expect(trpcSrc).toContain("session.userId");
      expect(trpcSrc).toContain("session.workspaceId");
    });

    it("adds rateLimitHeaders to ProtectedContext", () => {
      expect(trpcSrc).toContain("rateLimitHeaders:");
      expect(trpcSrc).toContain("rateLimitHeaders: Record<string, string>");
    });
  });

  describe("middleware chain completeness", () => {
    it("still has the 6-step chain documented in header", () => {
      expect(trpcSrc).toContain("Middleware chain");
      expect(trpcSrc).toContain("Resolve session");
      expect(trpcSrc).toContain("Rate limit");
      expect(trpcSrc).toContain("Load permission context");
      expect(trpcSrc).toContain("RLS session variables");
      expect(trpcSrc).toContain("Prisma proxy");
      expect(trpcSrc).toContain("traceId");
    });

    it("enforceAuth still throws UNAUTHORIZED", () => {
      expect(trpcSrc).toContain("UNAUTHORIZED");
      expect(trpcSrc).toContain("WATCHTOWER:AUTH:SESSION_EXPIRED");
    });

    it("requirePermission still returns NOT_FOUND (not FORBIDDEN)", () => {
      expect(trpcSrc).toContain("WATCHTOWER:AUTH:INSUFFICIENT_PERMISSION");
      const forbiddenCount = (trpcSrc.match(/"FORBIDDEN"/g) || []).length;
      expect(forbiddenCount).toBe(0);
    });

    it("still uses withRLS for transaction boundary", () => {
      expect(trpcSrc).toContain("withRLS");
    });

    it("still generates traceId per request", () => {
      expect(trpcSrc).toContain("crypto.randomUUID()");
    });
  });
});

describe("Phase 1.2 completeness — no remaining Phase 1.1 placeholders", () => {
  const workspaceSrc = readFile("apps/web/src/server/routers/workspace.ts");

  it("workspace router has no placeholder audit values", () => {
    // These were the Phase 1.1 placeholders
    expect(workspaceSrc).not.toContain('"0000000000000000000000000000000000000000000000000000000000000000"');
    expect(workspaceSrc).not.toContain('signingKeyId: "placeholder"');
    expect(workspaceSrc).not.toContain("chainSequence: 0,");
  });

  it("workspace router has no Phase 1.1 TODO comments", () => {
    expect(workspaceSrc).not.toContain("Phase 1.1");
    expect(workspaceSrc).not.toContain("ADR-002");
    expect(workspaceSrc).not.toContain("will be replaced");
  });

  it("workspace router uses createAuditEvent instead of raw create", () => {
    expect(workspaceSrc).toContain("createAuditEvent");
    expect(workspaceSrc).not.toContain("ctx.db.auditEvent.create");
  });

  it("workspace router uses idempotency middleware", () => {
    expect(workspaceSrc).toContain("checkIdempotencyKey");
    expect(workspaceSrc).toContain("saveIdempotencyResult");
  });
});
