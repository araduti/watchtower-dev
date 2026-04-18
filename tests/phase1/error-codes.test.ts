// =============================================================================
// Phase 1 — Error catalog invariant tests
// =============================================================================
// Static validation of the error code catalog. No database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  WATCHTOWER_ERRORS,
  flattenErrors,
} from "../../packages/errors/src/codes.ts";

const VALID_TRANSPORTS = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "TOO_MANY_REQUESTS",
  "INTERNAL_SERVER_ERROR",
]);

const CODE_PATTERN = /^WATCHTOWER:[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/;

describe("Error catalog invariants", () => {
  const allErrors = flattenErrors();

  it("all error codes are unique", () => {
    expect(allErrors.size).toBeGreaterThan(0);
    // flattenErrors uses Map keyed by code — duplicates would overwrite
    const codes = Array.from(allErrors.keys());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("all codes follow WATCHTOWER:DOMAIN:CODE pattern", () => {
    for (const [code] of allErrors) {
      expect(code, `"${code}" does not match pattern`).toMatch(CODE_PATTERN);
    }
  });

  it("all entries have a valid transport code", () => {
    for (const [code, def] of allErrors) {
      expect(
        VALID_TRANSPORTS.has(def.transport),
        `"${code}" has invalid transport "${def.transport}"`,
      ).toBe(true);
    }
  });

  it("all messages are non-empty and end-user safe", () => {
    const unsafeTerms = ["exception", "stack", "SQL", "query", "internal"];
    for (const [code, def] of allErrors) {
      expect(def.message.length, `"${code}" has empty message`).toBeGreaterThan(0);
      for (const term of unsafeTerms) {
        expect(
          def.message.toLowerCase().includes(term.toLowerCase()),
          `"${code}" message contains unsafe term "${term}"`,
        ).toBe(false);
      }
    }
  });

  it("INSUFFICIENT_PERMISSION returns NOT_FOUND (security invariant)", () => {
    const entry = WATCHTOWER_ERRORS.AUTH.INSUFFICIENT_PERMISSION;
    expect(entry.transport).toBe("NOT_FOUND");
  });

  it("all domains have at least one error code", () => {
    for (const [domain, entries] of Object.entries(WATCHTOWER_ERRORS)) {
      expect(
        Object.keys(entries).length,
        `domain "${domain}" is empty`,
      ).toBeGreaterThan(0);
    }
  });

  it("there are exactly 40 error codes", () => {
    expect(allErrors.size).toBe(40);
  });

  it("all domain keys are uppercase", () => {
    for (const domain of Object.keys(WATCHTOWER_ERRORS)) {
      expect(domain, `domain "${domain}" is not uppercase`).toBe(
        domain.toUpperCase(),
      );
    }
  });

  it("all error keys within each domain are uppercase", () => {
    for (const [domain, entries] of Object.entries(WATCHTOWER_ERRORS)) {
      for (const key of Object.keys(entries)) {
        expect(key, `"${domain}.${key}" is not uppercase`).toBe(
          key.toUpperCase(),
        );
      }
    }
  });

  it("transport codes are only the 8 allowed values", () => {
    const transportsUsed = new Set(
      Array.from(allErrors.values()).map((d) => d.transport),
    );
    for (const t of transportsUsed) {
      expect(VALID_TRANSPORTS.has(t), `"${t}" is not allowed`).toBe(true);
    }
  });

  it("every code string embeds its domain correctly", () => {
    for (const [domain, entries] of Object.entries(WATCHTOWER_ERRORS)) {
      for (const [, entry] of Object.entries(entries)) {
        const typed = entry as { code: string };
        expect(
          typed.code.startsWith(`WATCHTOWER:${domain}:`),
          `"${typed.code}" should start with "WATCHTOWER:${domain}:"`,
        ).toBe(true);
      }
    }
  });
});
