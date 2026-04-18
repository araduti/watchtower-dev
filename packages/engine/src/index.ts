/**
 * @watchtower/engine — Compliance evaluation engine.
 *
 * Evaluates ControlAssertions against collected evidence to produce
 * per-check results (pass/fail + warnings). This is the core logic
 * that turns raw Microsoft Graph data into compliance findings.
 *
 * The engine is framework-agnostic — it evaluates assertions regardless
 * of whether they come from CIS, ScubaGear, NIST, or customer-defined
 * frameworks. The framework identity is carried in the assertion data,
 * not in the engine code.
 *
 * Primary exports:
 * - `evaluateAssertions()` — Run all assertions against an evidence snapshot
 * - `evaluateControl()`   — Run a single assertion against evidence
 * - Type exports for integration with the scan pipeline
 *
 * @see docs/Architecture.md §13 — Engine integration
 * @see docs/decisions/004-single-engine-firecracker-sandbox.md
 */

export {
  evaluateAssertions,
  evaluateControl,
} from "./evaluate.ts";

export type {
  EngineAssertion,
  EngineResult,
  EngineConfig,
  EvidenceSnapshot,
} from "./types.ts";

// Re-export evaluator registry for plugin management
export {
  getEvaluator,
  getBuiltinEvaluator,
  isSandboxed,
  registrySize,
  registeredSlugs,
  sandboxedSlugs,
  registerPlugin,
  unregisterPlugin,
} from "../evaluators/registry.ts";

export type {
  EvaluatorFn,
  AsyncEvaluatorFn,
  EvaluatorResult,
  EvaluatorModule,
  RegisteredEvaluator,
} from "../evaluators/types.ts";
