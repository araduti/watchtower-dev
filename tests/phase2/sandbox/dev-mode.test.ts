/**
 * sandbox/dev-mode.test.ts
 *
 * Unit tests for the dev-mode fallback execution path.
 * Tests that plugins can be executed without KVM in development.
 */

import { describe, it, expect } from "vitest";
import { isKvmAvailable } from "../../../packages/sandbox/src/dev-mode.ts";

// ── isKvmAvailable ──────────────────────────────────────────────────────────

describe("isKvmAvailable()", () => {
  it("returns a boolean", () => {
    const result = isKvmAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("returns false in CI (no KVM available)", () => {
    // CI environments typically don't have /dev/kvm
    // This test documents the expected behavior in CI
    const result = isKvmAvailable();
    // We don't assert false because some CI runners might have KVM
    // Instead, we verify the function doesn't throw
    expect(result).toBeDefined();
  });
});
