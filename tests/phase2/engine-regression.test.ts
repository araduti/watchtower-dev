/**
 * engine-regression.test.ts
 *
 * Integration / regression test that verifies the extracted evaluator engine
 * produces the same pass/fail results as the pre-extraction baseline captured
 * in results-v2.json.
 *
 * Approach:
 *   1. Load evidence.json  → real tenant evidence snapshot
 *   2. Load results-v2.json → baseline pass/fail for every control
 *   3. Convert evidence to the snapshot format evaluators expect
 *   4. For every control backed by an evaluatorSlug in the registry,
 *      run the evaluator and compare pass/fail against the baseline
 *
 * This is the single most important regression gate — if an evaluator
 * refactor silently changes behavior, this test catches it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  getEvaluator,
  registrySize,
  registeredSlugs,
} from "../../packages/engine/evaluators/registry";
import { MOCKED_CONTROL_ASSERTIONS } from "../../packages/engine/assertions";
import type { EvidenceSnapshot } from "../../packages/engine/evaluators/types";

// ---------------------------------------------------------------------------
// Types for the JSON files (mirrors the shapes in the repo)
// ---------------------------------------------------------------------------

interface EvidenceSource {
  rawValue: any[];
  status: "ok" | "failed";
  collectedAt?: string;
  durationMs?: number;
  error?: string | null;
}

interface Evidence {
  collectedAt?: string;
  durationMs?: number;
  sourceCount?: number;
  sources: Record<string, EvidenceSource>;
}

interface BaselineResult {
  controlId: string;
  controlTitle: string;
  frameworkSlug: string;
  pass: boolean;
  failures: string[];
  [key: string]: unknown; // allow extra fields
}

interface Baseline {
  controlCount: number;
  passed: number;
  failed: number;
  results: BaselineResult[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = process.cwd();

function loadEvidence(): Evidence {
  const raw = readFileSync(join(ROOT, "evidence.json"), "utf-8");
  return JSON.parse(raw) as Evidence;
}

function loadBaseline(): Baseline {
  const raw = readFileSync(join(ROOT, "results-v2.json"), "utf-8");
  return JSON.parse(raw) as Baseline;
}

/**
 * Re-implements the engine's `evidenceToSnapshot` conversion.
 *
 * For every source with status === "ok" the rawValue array is placed
 * under snapshot.data[key].  The original engine has a branch that
 * unwraps singleton objects but the result is identical — the value
 * is still assigned as-is.  We replicate the logic faithfully here.
 */
function evidenceToSnapshot(evidence: Evidence): EvidenceSnapshot {
  const data: Record<string, any> = {};
  for (const [key, source] of Object.entries(evidence.sources)) {
    if (source.status === "ok") {
      // Mirror the engine: singleton-object unwrap path ultimately keeps
      // the same value; both branches assign source.rawValue.
      data[key] =
        source.rawValue.length === 1 &&
        !Array.isArray(source.rawValue[0]) &&
        typeof source.rawValue[0] === "object"
          ? source.rawValue
          : source.rawValue;
    }
  }
  return { data };
}

/**
 * Build a map from controlId → BaselineResult for O(1) lookups.
 */
function baselineByControlId(
  baseline: Baseline,
): Map<string, BaselineResult> {
  const map = new Map<string, BaselineResult>();
  for (const r of baseline.results) {
    map.set(r.controlId, r);
  }
  return map;
}

/**
 * Return control assertions that use registry evaluators (not CA-policy-match).
 */
function evaluatorBackedAssertions() {
  return MOCKED_CONTROL_ASSERTIONS.filter(
    (a) =>
      a.evaluatorSlug &&
      a.evaluatorSlug.length > 0 &&
      !a.evaluatorSlug.startsWith("ca-policy-match:"),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Engine regression — evaluator results match baseline", () => {
  // -----------------------------------------------------------------------
  // 1. Registry sanity checks
  // -----------------------------------------------------------------------
  describe("Registry sanity", () => {
    it("registrySize() is > 0", () => {
      expect(registrySize()).toBeGreaterThan(0);
    });

    it("registeredSlugs() returns a non-empty array of strings", () => {
      const slugs = registeredSlugs();
      expect(Array.isArray(slugs)).toBe(true);
      expect(slugs.length).toBeGreaterThan(0);
      for (const s of slugs) {
        expect(typeof s).toBe("string");
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Evidence loading
  // -----------------------------------------------------------------------
  describe("Evidence loading", () => {
    it("evidence.json loads and has sources", () => {
      const evidence = loadEvidence();
      expect(evidence).toBeDefined();
      expect(evidence.sources).toBeDefined();
      expect(Object.keys(evidence.sources).length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Baseline loading
  // -----------------------------------------------------------------------
  describe("Baseline loading", () => {
    it("results-v2.json loads and has results", () => {
      const baseline = loadBaseline();
      expect(baseline).toBeDefined();
      expect(baseline.results).toBeDefined();
      expect(Array.isArray(baseline.results)).toBe(true);
      expect(baseline.results.length).toBeGreaterThan(0);
      expect(baseline.controlCount).toBeGreaterThan(0);
    });

    it("baseline counts are consistent", () => {
      const baseline = loadBaseline();
      expect(baseline.results.length).toBe(baseline.controlCount);
      expect(baseline.passed + baseline.failed).toBe(baseline.controlCount);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Snapshot conversion
  // -----------------------------------------------------------------------
  describe("Evidence → Snapshot conversion", () => {
    it("snapshot.data has the same number of keys as OK sources", () => {
      const evidence = loadEvidence();
      const snapshot = evidenceToSnapshot(evidence);

      const okSourceCount = Object.values(evidence.sources).filter(
        (s) => s.status === "ok",
      ).length;

      expect(snapshot.data).toBeDefined();
      expect(Object.keys(snapshot.data!).length).toBe(okSourceCount);
    });

    it("snapshot.data keys match the OK source keys exactly", () => {
      const evidence = loadEvidence();
      const snapshot = evidenceToSnapshot(evidence);

      const okKeys = Object.entries(evidence.sources)
        .filter(([, s]) => s.status === "ok")
        .map(([k]) => k)
        .sort();

      const dataKeys = Object.keys(snapshot.data!).sort();
      expect(dataKeys).toEqual(okKeys);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Per-evaluator regression — each slug matches the baseline
  // -----------------------------------------------------------------------
  describe("Evaluator-backed controls match baseline", () => {
    const evidence = loadEvidence();
    const snapshot = evidenceToSnapshot(evidence);
    const baseline = loadBaseline();
    const resultMap = baselineByControlId(baseline);
    const assertions = evaluatorBackedAssertions();

    // Sanity: we expect at least some evaluator-backed assertions
    it("has evaluator-backed assertions to test", () => {
      expect(assertions.length).toBeGreaterThan(0);
    });

    for (const assertion of assertions) {
      const slug = assertion.evaluatorSlug!;
      const controlId = assertion.controlId;
      const baselineResult = resultMap.get(controlId);

      it(`[${controlId}] evaluator "${slug}" produces baseline-matching result`, () => {
        // The evaluator must exist in the registry
        const evaluator = getEvaluator(slug);
        expect(
          evaluator,
          `Evaluator "${slug}" for control ${controlId} not found in registry`,
        ).toBeDefined();

        // The control must exist in the baseline
        expect(
          baselineResult,
          `Control ${controlId} not found in baseline results`,
        ).toBeDefined();

        // Run the evaluator against the real evidence snapshot
        const result = evaluator!(snapshot);

        // Core assertion: pass/fail must match the baseline
        expect(result.pass).toBe(
          baselineResult!.pass,
          `Control ${controlId} ("${assertion.controlTitle}"): ` +
            `evaluator "${slug}" returned pass=${result.pass} ` +
            `but baseline expected pass=${baselineResult!.pass}. ` +
            `Warnings: ${JSON.stringify(result.warnings)}`,
        );
      });
    }
  });

  // -----------------------------------------------------------------------
  // 6. Aggregate: all evaluator-based results are behavior-preserving
  // -----------------------------------------------------------------------
  describe("Aggregate behavior preservation", () => {
    it("every evaluator-backed control matches the baseline pass/fail", () => {
      const evidence = loadEvidence();
      const snapshot = evidenceToSnapshot(evidence);
      const baseline = loadBaseline();
      const resultMap = baselineByControlId(baseline);
      const assertions = evaluatorBackedAssertions();

      const mismatches: string[] = [];

      for (const assertion of assertions) {
        const slug = assertion.evaluatorSlug!;
        const controlId = assertion.controlId;
        const baselineResult = resultMap.get(controlId);

        if (!baselineResult) {
          mismatches.push(
            `${controlId}: missing from baseline`,
          );
          continue;
        }

        const evaluator = getEvaluator(slug);
        if (!evaluator) {
          mismatches.push(
            `${controlId}: evaluator "${slug}" not in registry`,
          );
          continue;
        }

        const result = evaluator(snapshot);
        if (result.pass !== baselineResult.pass) {
          mismatches.push(
            `${controlId} ("${assertion.controlTitle}"): ` +
              `evaluator "${slug}" pass=${result.pass}, ` +
              `baseline pass=${baselineResult.pass}`,
          );
        }
      }

      expect(
        mismatches,
        `Behavior-breaking mismatches:\n${mismatches.join("\n")}`,
      ).toHaveLength(0);
    });
  });
});
