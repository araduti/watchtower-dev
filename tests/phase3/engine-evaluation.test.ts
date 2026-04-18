// =============================================================================
// Phase 3 — Engine evaluation unit tests
// =============================================================================
// Tests the @watchtower/engine evaluation functions directly, without
// database access. These are pure function tests.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  evaluateControl,
  evaluateAssertions,
} from "../../packages/engine/src/evaluate.ts";
import type {
  EngineAssertion,
  EngineConfig,
  EvidenceSnapshot,
} from "../../packages/engine/src/types.ts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: EngineConfig = {
  breakGlassAccounts: [],
};

function makeAssertion(
  overrides: Partial<EngineAssertion>,
): EngineAssertion {
  return {
    checkSlug: "test.check",
    source: "testSource",
    property: "testProperty",
    operator: "eq",
    expectedValue: true,
    assertionLogic: "ALL",
    ...overrides,
  };
}

// ==========================================================================
// §1 — Simple operator evaluation
// ==========================================================================

describe("Simple operators", () => {
  it("eq — passes when actual equals expected", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: true, id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "eq", expectedValue: true }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("eq — fails when actual does not equal expected", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: false, id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "eq", expectedValue: true }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("eq — treats null as false (Graph convention)", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: null, id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "eq", expectedValue: false }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("neq — passes when values differ", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: 1, id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "neq", expectedValue: 0 }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("in — passes when value is in expected array", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: "b", id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "in", expectedValue: ["a", "b", "c"] }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("in — fails when value is not in expected array", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: "d", id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "in", expectedValue: ["a", "b", "c"] }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
  });

  it("lte — passes when value <= expected", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: 3, id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "lte", expectedValue: 5 }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("gte — fails when value < expected", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: 1, id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "gte", expectedValue: 5 }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
  });

  it("notEmpty — passes when value is non-empty", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: "hello", id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "notEmpty", expectedValue: true }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("notEmpty — fails when value is null", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: null, id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "notEmpty", expectedValue: true }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
  });

  it("contains — string contains substring (case insensitive)", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: "Hello World", id: "a" }] },
    };
    const result = evaluateControl(
      makeAssertion({ operator: "contains", expectedValue: "hello" }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });
});

// ==========================================================================
// §2 — Count assertions
// ==========================================================================

describe("Count operator", () => {
  it("passes when count is within {min, max} range", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ id: "1" }, { id: "2" }, { id: "3" }] },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "count",
        expectedValue: { min: 2, max: 4 },
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
    expect(result.actualValues).toEqual({ count: 3 });
  });

  it("fails when count exceeds max", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [
          { id: "1" },
          { id: "2" },
          { id: "3" },
          { id: "4" },
          { id: "5" },
        ],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "count",
        expectedValue: { min: 2, max: 4 },
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
  });

  it("applies source filter before counting", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [
          { id: "1", active: true },
          { id: "2", active: false },
          { id: "3", active: true },
        ],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "count",
        expectedValue: { min: 2, max: 2 },
        sourceFilter: { active: true },
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
    expect(result.actualValues).toEqual({ count: 2 });
  });
});

// ==========================================================================
// §3 — AllowedValues assertions
// ==========================================================================

describe("AllowedValues operator", () => {
  it("passes when all values are in allowed set", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [
          { testProperty: "A", id: "1" },
          { testProperty: "B", id: "2" },
        ],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "allowedValues",
        expectedValue: ["A", "B", "C"],
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("fails when a value is not in allowed set", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [
          { testProperty: "A", id: "1" },
          { testProperty: "X", id: "2" },
        ],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "allowedValues",
        expectedValue: ["A", "B", "C"],
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ==========================================================================
// §4 — Manual operator
// ==========================================================================

describe("Manual operator", () => {
  it("always fails with a human review message", () => {
    const snapshot: EvidenceSnapshot = { data: {} };
    const result = evaluateControl(
      makeAssertion({ operator: "manual" }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("Manual check required");
  });
});

// ==========================================================================
// §5 — Missing source data
// ==========================================================================

describe("Missing source data", () => {
  it("fails when source is not in snapshot", () => {
    const snapshot: EvidenceSnapshot = { data: {} };
    const result = evaluateControl(
      makeAssertion({ source: "nonExistentSource" }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("not available or empty");
  });

  it("fails when source is empty array", () => {
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [] },
    };
    const result = evaluateControl(
      makeAssertion({}),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("not available or empty");
  });
});

// ==========================================================================
// §6 — evaluateAssertions (batch evaluation)
// ==========================================================================

describe("evaluateAssertions", () => {
  it("returns results keyed by checkSlug", () => {
    const assertions: EngineAssertion[] = [
      makeAssertion({ checkSlug: "check.one", operator: "eq", expectedValue: true }),
      makeAssertion({ checkSlug: "check.two", operator: "eq", expectedValue: false }),
    ];
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [{ testProperty: true, id: "a" }],
      },
    };

    const results = evaluateAssertions(assertions, snapshot, DEFAULT_CONFIG);
    expect(results.size).toBe(2);
    expect(results.has("check.one")).toBe(true);
    expect(results.has("check.two")).toBe(true);
    expect(results.get("check.one")!.pass).toBe(true);
    expect(results.get("check.two")!.pass).toBe(false);
  });

  it("AND-combines multiple assertions for the same checkSlug", () => {
    const assertions: EngineAssertion[] = [
      makeAssertion({
        checkSlug: "check.multi",
        source: "src1",
        operator: "eq",
        expectedValue: true,
      }),
      makeAssertion({
        checkSlug: "check.multi",
        source: "src2",
        operator: "eq",
        expectedValue: 42,
        property: "value",
      }),
    ];
    const snapshot: EvidenceSnapshot = {
      data: {
        src1: [{ testProperty: true, id: "a" }],
        src2: [{ value: 42, id: "b" }],
      },
    };

    const results = evaluateAssertions(assertions, snapshot, DEFAULT_CONFIG);
    expect(results.size).toBe(1);
    expect(results.get("check.multi")!.pass).toBe(true);
  });

  it("fails when one of multiple assertions fails", () => {
    const assertions: EngineAssertion[] = [
      makeAssertion({
        checkSlug: "check.multi",
        source: "src1",
        operator: "eq",
        expectedValue: true,
      }),
      makeAssertion({
        checkSlug: "check.multi",
        source: "src2",
        operator: "eq",
        expectedValue: 42,
        property: "value",
      }),
    ];
    const snapshot: EvidenceSnapshot = {
      data: {
        src1: [{ testProperty: true, id: "a" }],
        src2: [{ value: 99, id: "b" }], // This fails
      },
    };

    const results = evaluateAssertions(assertions, snapshot, DEFAULT_CONFIG);
    expect(results.get("check.multi")!.pass).toBe(false);
    expect(results.get("check.multi")!.warnings.length).toBeGreaterThan(0);
  });

  it("includes evaluatedAt timestamp in results", () => {
    const assertions: EngineAssertion[] = [
      makeAssertion({ checkSlug: "check.timestamp" }),
    ];
    const snapshot: EvidenceSnapshot = {
      data: { testSource: [{ testProperty: true, id: "a" }] },
    };

    const results = evaluateAssertions(assertions, snapshot, DEFAULT_CONFIG);
    const result = results.get("check.timestamp")!;
    expect(result.evaluatedAt).toBeDefined();
    // Should be a valid ISO 8601 timestamp
    expect(() => new Date(result.evaluatedAt)).not.toThrow();
  });
});

// ==========================================================================
// §7 — Additional assertions (AND-combined)
// ==========================================================================

describe("Additional assertions", () => {
  it("passes when primary and additional assertions all pass", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [{ testProperty: true, secondProperty: 10, id: "a" }],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "eq",
        expectedValue: true,
        additionalAssertions: [
          {
            property: "secondProperty",
            operator: "gte",
            expectedValue: 5,
          },
        ],
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("fails when additional assertion fails even if primary passes", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [{ testProperty: true, secondProperty: 1, id: "a" }],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "eq",
        expectedValue: true,
        additionalAssertions: [
          {
            property: "secondProperty",
            operator: "gte",
            expectedValue: 5,
          },
        ],
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(false);
  });

  it("supports cross-source additional assertions", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [{ testProperty: true, id: "a" }],
        otherSource: [{ otherProp: "valid", id: "b" }],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "eq",
        expectedValue: true,
        additionalAssertions: [
          {
            source: "otherSource",
            property: "otherProp",
            operator: "eq",
            expectedValue: "valid",
          },
        ],
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });
});

// ==========================================================================
// §8 — Source filters
// ==========================================================================

describe("Source filters", () => {
  it("filters items by simple equality before evaluation", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [
          { type: "admin", testProperty: true, id: "1" },
          { type: "user", testProperty: false, id: "2" },
        ],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "eq",
        expectedValue: true,
        sourceFilter: { type: "admin" },
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    expect(result.pass).toBe(true);
  });

  it("supports $ne operator in source filters", () => {
    const snapshot: EvidenceSnapshot = {
      data: {
        testSource: [
          { type: "admin", testProperty: true, id: "1" },
          { type: "user", testProperty: true, id: "2" },
        ],
      },
    };
    const result = evaluateControl(
      makeAssertion({
        operator: "eq",
        expectedValue: true,
        sourceFilter: { type: { $ne: "admin" } },
      }),
      snapshot,
      DEFAULT_CONFIG,
    );
    // Only user item remains, and it passes
    expect(result.pass).toBe(true);
  });
});
