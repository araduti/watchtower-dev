/**
 * @watchtower/engine — Type definitions for the evaluation engine.
 *
 * These types define the contract between the scan pipeline and the engine.
 * They are intentionally decoupled from Prisma types — the scan pipeline
 * maps DB rows to these shapes before calling the engine.
 */

/**
 * The evidence snapshot shape passed to the engine.
 * `data` is a record of evidence source keys to their collected values.
 *
 * Example:
 * ```
 * {
 *   data: {
 *     conditionalAccessPolicies: [...],
 *     spoTenant: [...],
 *     privilegedUsers: [...]
 *   }
 * }
 * ```
 */
export interface EvidenceSnapshot {
  data?: Record<string, unknown>;
}

/**
 * Operator types supported by the assertion engine.
 *
 * Each operator defines how `actualValue` is compared to `expectedValue`:
 * - `eq`              — strict equality
 * - `neq`             — strict inequality
 * - `in`              — value is in expected array
 * - `lte` / `gte`     — numeric comparison
 * - `notEmpty`        — value is non-null, non-empty
 * - `contains`        — string/array contains expected
 * - `notContainsAny`  — array/string does not contain any of expected values
 * - `count`           — filtered item count within {min, max} range
 * - `allowedValues`   — every item's property is in allowed set
 * - `custom`          — delegate to registered evaluator by slug
 * - `manual`          — no automation, flag for human review
 * - `ca-match`        — Conditional Access policy match spec
 * - `nestedFind`      — find item in nested array, assert on property
 */
export type Operator =
  | "eq"
  | "neq"
  | "in"
  | "lte"
  | "gte"
  | "notEmpty"
  | "manual"
  | "count"
  | "allowedValues"
  | "custom"
  | "contains"
  | "notContainsAny"
  | "nestedFind"
  | "ca-match";

/**
 * A single assertion to evaluate. This is the engine's view of a
 * ControlAssertion — mapped from DB rows by the scan pipeline.
 *
 * The engine is framework-agnostic: it evaluates the assertion regardless
 * of whether it came from CIS, ScubaGear, NIST, or a customer framework.
 */
export interface EngineAssertion {
  /** Check slug — stable identifier for the check (e.g., "wt.entra.ca.require_mfa_admins") */
  readonly checkSlug: string;

  /** Evidence source key (e.g., "conditionalAccessPolicies") */
  readonly source: string;

  /** Property path on each source item (e.g., "sharingCapability") */
  readonly property: string;

  /** Comparison operator */
  readonly operator: Operator;

  /** Expected value — scalar, array, or structured (e.g., {min: 2, max: 4} for count) */
  readonly expectedValue: unknown;

  /** Optional filter applied before asserting (e.g., {isVerified: true}) */
  readonly sourceFilter?: Record<string, unknown>;

  /** How multiple items are grouped: ALL must pass or ANY one passes */
  readonly assertionLogic: "ALL" | "ANY";

  /** Evaluator slug for custom/complex evaluations */
  readonly evaluatorSlug?: string;

  /** Nested array find configuration */
  readonly nestedFind?: {
    readonly arrayPath: string;
    readonly findBy: Record<string, unknown>;
    readonly property: string;
  };

  /** Additional assertions on the same control (AND-combined) */
  readonly additionalAssertions?: ReadonlyArray<{
    readonly source?: string;
    readonly property: string;
    readonly operator: Operator;
    readonly expectedValue: unknown;
    readonly sourceFilter?: Record<string, unknown>;
  }>;

  /** CA policy match spec (when operator is "ca-match") */
  readonly caMatchSpec?: Record<string, unknown>;
}

/**
 * The result of evaluating a single assertion against evidence.
 */
export interface EngineResult {
  /** The check slug this result corresponds to */
  readonly checkSlug: string;

  /** Whether the check passed */
  readonly pass: boolean;

  /** Human-readable failure/warning messages (empty array on pass) */
  readonly warnings: string[];

  /** Actual values observed during evaluation (for evidence storage) */
  readonly actualValues: Record<string, unknown>;

  /** ISO 8601 timestamp when the evaluation was performed */
  readonly evaluatedAt: string;
}

/**
 * Engine configuration.
 */
export interface EngineConfig {
  /** Break-glass account IDs excluded from CA policy exclusion checks */
  readonly breakGlassAccounts: string[];
}
