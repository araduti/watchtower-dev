// =============================================================================
// Phase 1.2 — Rate limiting convention tests
// =============================================================================
// Validates the rate limiting module follows API-Conventions.md §11.
// Source-level static analysis + unit tests — no database required.
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), "utf-8");
}

describe("Rate limiting module (API-Conventions §11)", () => {
  const src = readFile("apps/web/src/server/rate-limit.ts");

  describe("tier configuration", () => {
    it("defines query tier with 100 requests / 60s", () => {
      expect(src).toContain("query:");
      expect(src).toContain("maxRequests: 100");
    });

    it("defines mutation tier with 30 requests / 60s", () => {
      expect(src).toContain("mutation:");
      expect(src).toContain("maxRequests: 30");
    });

    it("defines auth tier with 10 requests / 60s", () => {
      expect(src).toContain("auth:");
      expect(src).toContain("maxRequests: 10");
    });

    it("all windows are 60 seconds", () => {
      expect(src).toContain("windowMs: 60_000");
    });
  });

  describe("exports", () => {
    it("exports checkRateLimit function", () => {
      expect(src).toContain("export function checkRateLimit");
    });

    it("exports rateLimitHeaders function", () => {
      expect(src).toContain("export function rateLimitHeaders");
    });

    it("exports RATE_LIMIT_TIERS config", () => {
      expect(src).toContain("export const RATE_LIMIT_TIERS");
    });

    it("exports RateLimitTier type", () => {
      expect(src).toContain("export type RateLimitTier");
    });

    it("exports RateLimitResult interface", () => {
      expect(src).toContain("export interface RateLimitResult");
    });

    it("exports test reset utility", () => {
      expect(src).toContain("export function _resetRateLimitState");
    });
  });

  describe("response headers", () => {
    it("produces X-RateLimit-Limit header", () => {
      expect(src).toContain("X-RateLimit-Limit");
    });

    it("produces X-RateLimit-Remaining header", () => {
      expect(src).toContain("X-RateLimit-Remaining");
    });

    it("produces X-RateLimit-Reset header", () => {
      expect(src).toContain("X-RateLimit-Reset");
    });
  });

  describe("implementation", () => {
    it("uses in-memory store (no Redis, no Postgres)", () => {
      expect(src).toContain("new Map");
      expect(src).not.toContain("redis");
      expect(src).not.toContain("pg.Pool");
      expect(src).not.toContain("prisma");
    });

    it("has cleanup mechanism to prevent memory leaks", () => {
      expect(src).toContain("cleanupExpiredEntries");
      expect(src).toContain("setInterval");
    });

    it("unrefs the cleanup timer so process can exit cleanly", () => {
      expect(src).toContain("unref");
    });

    it("increments counter even on denial (anti-spam)", () => {
      expect(src).toContain("count += 1");
    });
  });
});

describe("Rate limiting unit tests", () => {
  // Dynamic import so the module is loaded fresh for functional tests
  let checkRateLimit: (
    tier: "query" | "mutation" | "auth",
    key: string,
  ) => { allowed: boolean; limit: number; remaining: number; resetMs: number };
  let rateLimitHeaders: (result: {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetMs: number;
  }) => Record<string, string>;
  let _resetRateLimitState: () => void;

  beforeEach(async () => {
    const mod = await import(
      join(root, "apps/web/src/server/rate-limit.ts")
    );
    checkRateLimit = mod.checkRateLimit;
    rateLimitHeaders = mod.rateLimitHeaders;
    _resetRateLimitState = mod._resetRateLimitState;
    _resetRateLimitState();
  });

  it("allows requests within limit", () => {
    const result = checkRateLimit("query", "user1:ws1");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(99);
  });

  it("denies requests after exceeding limit", () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit("mutation", "user2:ws2");
    }
    const result = checkRateLimit("mutation", "user2:ws2");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks different tiers independently", () => {
    // Exhaust mutation limit
    for (let i = 0; i < 30; i++) {
      checkRateLimit("mutation", "user3:ws3");
    }
    // Query should still work
    const queryResult = checkRateLimit("query", "user3:ws3");
    expect(queryResult.allowed).toBe(true);
  });

  it("tracks different keys independently", () => {
    // Exhaust limit for user A
    for (let i = 0; i < 30; i++) {
      checkRateLimit("mutation", "userA:ws1");
    }
    // User B should still work
    const result = checkRateLimit("mutation", "userB:ws1");
    expect(result.allowed).toBe(true);
  });

  it("produces correct header format", () => {
    const result = checkRateLimit("query", "userH:wsH");
    const headers = rateLimitHeaders(result);

    expect(headers["X-RateLimit-Limit"]).toBe("100");
    expect(headers["X-RateLimit-Remaining"]).toBe("99");
    expect(headers["X-RateLimit-Reset"]).toBeDefined();
    // Reset should be a Unix epoch timestamp (number as string)
    expect(Number(headers["X-RateLimit-Reset"])).toBeGreaterThan(0);
  });

  it("auth tier has the lowest limit", () => {
    // Should be limited to 10
    for (let i = 0; i < 10; i++) {
      const r = checkRateLimit("auth", "192.168.1.1");
      expect(r.allowed).toBe(true);
    }
    const result = checkRateLimit("auth", "192.168.1.1");
    expect(result.allowed).toBe(false);
  });

  it("remaining is never negative", () => {
    for (let i = 0; i < 15; i++) {
      checkRateLimit("auth", "192.168.1.2");
    }
    const result = checkRateLimit("auth", "192.168.1.2");
    expect(result.remaining).toBe(0);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("tRPC middleware rate limiting integration", () => {
  const src = readFile("apps/web/src/server/trpc.ts");

  it("imports checkRateLimit from rate-limit module", () => {
    expect(src).toContain("checkRateLimit");
    expect(src).toContain("./rate-limit.ts");
  });

  it("imports rateLimitHeaders", () => {
    expect(src).toContain("rateLimitHeaders");
  });

  it("checks rate limit in protectedMiddleware", () => {
    expect(src).toContain("checkRateLimit(");
  });

  it("uses mutation tier for mutations and query tier for queries", () => {
    expect(src).toContain('"mutation"');
    expect(src).toContain('"query"');
  });

  it("throws RATE_LIMIT.EXCEEDED when not allowed", () => {
    expect(src).toContain("RATE_LIMIT");
    expect(src).toContain("EXCEEDED");
  });

  it("exposes rateLimitHeaders in ProtectedContext", () => {
    expect(src).toContain("rateLimitHeaders");
  });

  it("uses userId:workspaceId as rate limit key", () => {
    expect(src).toContain("session.userId");
    expect(src).toContain("session.workspaceId");
  });
});
