/**
 * evaluators/types.ts
 *
 * Contract for all evaluator functions — built-in and customer-authored.
 *
 * Every evaluator receives the full evidence snapshot and returns a result
 * with pass/fail status and human-readable failure details. This is the
 * boundary between "what to check" (ControlAssertion data) and "how to
 * check it" (evaluator logic).
 *
 * Built-in evaluators are trusted code shipped with the platform.
 * Customer-authored evaluators execute inside Firecracker microVMs —
 * same contract, hardware-level isolation. See ADR-004.
 */

/**
 * The evidence snapshot shape passed to every evaluator.
 * `data` is a record of evidence source keys to their collected values.
 */
export interface EvidenceSnapshot {
  data?: Record<string, any>;
}

/**
 * The result returned by every evaluator.
 * - `pass`: whether the check passed
 * - `warnings`: human-readable failure/warning messages (empty array on pass)
 */
export interface EvaluatorResult {
  pass: boolean;
  warnings: string[];
}

/**
 * The evaluator function signature for built-in (trusted) evaluators.
 *
 * Every built-in evaluator — whether it checks DNS records, PIM policies,
 * Teams settings, or anything else — conforms to this synchronous shape.
 * The engine doesn't know what the evaluator does; it only knows how to
 * call it and read the result.
 *
 * @param snapshot - The full evidence snapshot (snapshot.data contains source keys)
 * @returns EvaluatorResult with pass/fail and any warning messages
 */
export type EvaluatorFn = (snapshot: EvidenceSnapshot) => EvaluatorResult;

/**
 * The evaluator function signature for sandboxed (customer plugin) evaluators.
 *
 * Sandboxed evaluators are inherently async because they dispatch execution
 * to a Firecracker microVM (or dev-mode fallback). The registry wraps the
 * sandbox lifecycle behind this signature. The engine awaits the result.
 *
 * @param snapshot - The full evidence snapshot (snapshot.data contains source keys)
 * @returns Promise<EvaluatorResult> — the validated result from the sandbox
 */
export type AsyncEvaluatorFn = (snapshot: EvidenceSnapshot) => Promise<EvaluatorResult>;

/**
 * A named evaluator module. The slug is the stable identifier used in
 * ControlAssertion.evaluatorSlug to route evaluation to this function.
 */
export interface EvaluatorModule {
  /** Stable slug matching ControlAssertion.evaluatorSlug, e.g. "dmarc-published" */
  slug: string;
  /** The evaluator function */
  evaluate: EvaluatorFn;
}

/**
 * A registered evaluator entry in the registry.
 * Tracks whether the evaluator is sandboxed (customer plugin) or
 * trusted (built-in).
 */
export interface RegisteredEvaluator {
  /** The evaluator function (sync for built-in, async for sandboxed) */
  evaluate: EvaluatorFn | AsyncEvaluatorFn;
  /** Whether this evaluator runs inside a Firecracker microVM */
  sandboxed: boolean;
}
