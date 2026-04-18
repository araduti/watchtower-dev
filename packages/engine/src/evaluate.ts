/**
 * @watchtower/engine — Core evaluation logic.
 *
 * Wraps the proven evaluation functions from the argus engine into a
 * clean library API suitable for the scan pipeline to call.
 *
 * The evaluation logic itself lives in `../argus.engine-v2.ts` —
 * this module re-exports the key functions with typed signatures
 * that the scan pipeline consumes.
 *
 * Architecture note: The argus engine file contains both the reusable
 * evaluation logic AND a CLI entrypoint (at the bottom, reading from
 * evidence.json). This module imports only the evaluation functions.
 * The CLI entrypoint continues to work for local development.
 */

import type {
  EngineAssertion,
  EngineResult,
  EngineConfig,
  EvidenceSnapshot,
  Operator,
} from "./types.ts";
import { getBuiltinEvaluator, getEvaluator, isSandboxed } from "../evaluators/registry.ts";

// ---------------------------------------------------------------------------
// Operator evaluation (extracted from argus.engine-v2.ts)
// ---------------------------------------------------------------------------

function evalOperator(actual: unknown, operator: Operator, expected: unknown): boolean {
  switch (operator) {
    case "eq":
      return actual === expected || (actual === null && expected === false);
    case "neq":
      return actual !== expected && !(actual === null && expected === false);
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "lte":
      return typeof actual === "number" && (actual as number) <= (expected as number);
    case "gte":
      return typeof actual === "number" && (actual as number) >= (expected as number);
    case "notEmpty": {
      const isEmpty =
        actual == null ||
        actual === "" ||
        (Array.isArray(actual) && actual.length === 0);
      return expected === false ? isEmpty : !isEmpty;
    }
    case "contains": {
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      if (Array.isArray(actual)) {
        return actual.some((item) => item === expected);
      }
      return false;
    }
    case "notContainsAny": {
      if (!Array.isArray(expected)) return true;
      if (Array.isArray(actual)) {
        return !actual.some((item) =>
          (expected as unknown[]).some((d) =>
            typeof item === "string" && typeof d === "string"
              ? item.toLowerCase().includes(d.toLowerCase())
              : item === d,
          ),
        );
      }
      if (typeof actual === "string") {
        return !(expected as unknown[]).some(
          (d) =>
            typeof d === "string" &&
            actual.toLowerCase().includes(d.toLowerCase()),
        );
      }
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Property access
// ---------------------------------------------------------------------------

function getProperty(obj: unknown, path: string): unknown {
  if (!path) return obj;
  // Supports dot-notation ("a.b.c") and bracket-escaped keys ('a.["@odata.type"]').
  // Examples: "sharingCapability", "grantControls.builtInControls", '["@odata.type"]'
  const segments = path.match(/\["[^"]*"\]|[^.\[\]]+/g) ?? [];
  return segments.reduce((o: unknown, seg) => {
    const key = seg.startsWith('["') ? seg.slice(2, -2) : seg;
    return (o as Record<string, unknown>)?.[key];
  }, obj);
}

// ---------------------------------------------------------------------------
// Source filter
// ---------------------------------------------------------------------------

function applySourceFilter(
  items: unknown[],
  filter: Record<string, unknown> | undefined,
): unknown[] {
  if (!filter) return items;
  return items.filter((item) =>
    Object.entries(filter).every(([k, v]) => {
      const itemVal = getProperty(item, k);

      // Operator objects: { $ne: ... }, { $in: [...] }, { $exists: bool }
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const opObj = v as Record<string, unknown>;
        if ("$ne" in opObj) return itemVal !== opObj.$ne;
        if ("$in" in opObj) return Array.isArray(opObj.$in) && (opObj.$in as unknown[]).includes(itemVal);
        if ("$exists" in opObj) return opObj.$exists ? itemVal != null : itemVal == null;
      }

      // Plain equality / array-includes
      if (Array.isArray(itemVal)) return (itemVal as unknown[]).includes(v);
      return itemVal === v;
    }),
  );
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

// ---------------------------------------------------------------------------
// CA policy match engine (simplified from argus.engine-v2.ts)
// ---------------------------------------------------------------------------

interface CaMatchConfig {
  breakGlassAccounts: string[];
}

interface CaCriterion {
  label: string;
  pass: boolean;
  warn?: boolean;
}

function evaluateCaPolicy(
  policy: Record<string, unknown>,
  matchSpec: Record<string, unknown>,
  config: CaMatchConfig,
): CaCriterion[] {
  const criteria: CaCriterion[] = [];
  const m = matchSpec;

  // Users
  const users = m.users as Record<string, unknown> | undefined;
  if (users?.include === "All") {
    const policyUsers = ((policy.conditions as Record<string, unknown>)?.users as Record<string, unknown>)?.includeUsers as string[] ?? [];
    criteria.push({ label: "targets all users", pass: policyUsers.includes("All") });
  }
  if (users?.roles) {
    const included = ((policy.conditions as Record<string, unknown>)?.users as Record<string, unknown>)?.includeRoles as string[] ?? [];
    const missing = (users.roles as string[]).filter((r) => !included.includes(r));
    criteria.push({ label: `covers required roles (${missing.length} missing)`, pass: missing.length === 0 });
  }

  // Apps
  const apps = m.apps as Record<string, unknown> | undefined;
  if (apps?.include) {
    const policyApps = ((policy.conditions as Record<string, unknown>)?.applications as Record<string, unknown>)?.includeApplications as string[] ?? [];
    criteria.push({ label: `targets ${apps.include}`, pass: policyApps.includes(apps.include as string) });
  }
  if (apps?.noExclusions) {
    const exc = ((policy.conditions as Record<string, unknown>)?.applications as Record<string, unknown>)?.excludeApplications as string[] ?? [];
    criteria.push({ label: "no app exclusions", pass: exc.length === 0 });
  }

  // Grant controls
  const grant = m.grant as Record<string, unknown> | undefined;
  if (grant?.anyOf) {
    const builtIn = (policy.grantControls as Record<string, unknown>)?.builtInControls as string[] ?? [];
    const hit = (grant.anyOf as string[]).find((c) => builtIn.includes(c));
    criteria.push({ label: `requires ${(grant.anyOf as string[]).join(" or ")}`, pass: !!hit });
  }
  if (grant?.operator) {
    const op = (policy.grantControls as Record<string, unknown>)?.operator as string ?? "";
    criteria.push({ label: `grant operator is ${grant.operator}`, pass: op === grant.operator });
  }
  if (grant?.authStrength) {
    const id = ((policy.grantControls as Record<string, unknown>)?.authenticationStrength as Record<string, unknown>)?.id;
    criteria.push({ label: "requires phishing-resistant MFA", pass: id === grant.authStrength });
  }

  // Exclusions
  if (m.exclusions === "break-glass-only") {
    const excludedUsers = ((policy.conditions as Record<string, unknown>)?.users as Record<string, unknown>)?.excludeUsers as string[] ?? [];
    const excludedGroups = ((policy.conditions as Record<string, unknown>)?.users as Record<string, unknown>)?.excludeGroups as string[] ?? [];
    const allExcluded = [...excludedUsers, ...excludedGroups];

    if (config.breakGlassAccounts.length === 0) {
      criteria.push({ label: `exclusions (${allExcluded.length}) — break-glass not configured`, pass: true, warn: allExcluded.length > 0 });
    } else {
      const unexpected = allExcluded.filter((id) => !config.breakGlassAccounts.includes(id));
      criteria.push({ label: unexpected.length === 0 ? `exclusions are break-glass only (${allExcluded.length} excluded)` : `${unexpected.length} non-break-glass exclusion(s) found`, pass: unexpected.length === 0 });
    }
  }

  // Client app types
  if (m.clientAppTypes) {
    const conditions = (policy.conditions as Record<string, unknown>)?.clientAppTypes as string[] ?? [];
    const allPresent = (m.clientAppTypes as string[]).every((t) => conditions.some((c) => c.toLowerCase() === t.toLowerCase()));
    criteria.push({ label: `client app types: ${(m.clientAppTypes as string[]).join(", ")}`, pass: allPresent });
  }

  // Authentication flows
  if (m.authenticationFlows) {
    const raw = ((policy.conditions as Record<string, unknown>)?.authenticationFlows as Record<string, unknown>)?.transferMethods;
    const transfers: string[] = Array.isArray(raw) ? raw as string[] : typeof raw === "string" ? (raw as string).split(",").map((s) => s.trim()) : [];
    const allPresent = (m.authenticationFlows as string[]).every((f) => transfers.some((t) => t.toLowerCase() === f.toLowerCase()));
    criteria.push({ label: `authentication flows: ${(m.authenticationFlows as string[]).join(", ")}`, pass: allPresent });
  }

  // Risk levels
  if (m.userRisk) {
    const levels = (policy.conditions as Record<string, unknown>)?.userRiskLevels as string[] ?? [];
    const allPresent = (m.userRisk as string[]).every((r) => levels.some((l) => l.toLowerCase() === r.toLowerCase()));
    criteria.push({ label: `user risk levels: ${(m.userRisk as string[]).join(", ")}`, pass: allPresent });
  }
  if (m.signInRisk) {
    const levels = (policy.conditions as Record<string, unknown>)?.signInRiskLevels as string[] ?? [];
    const allPresent = (m.signInRisk as string[]).every((r) => levels.some((l) => l.toLowerCase() === r.toLowerCase()));
    criteria.push({ label: `sign-in risk levels: ${(m.signInRisk as string[]).join(", ")}`, pass: allPresent });
  }

  // Session controls
  const session = m.session as Record<string, unknown> | undefined;
  if (session) {
    const sc = policy.sessionControls as Record<string, unknown> ?? {};
    if (session.appEnforcedRestrictions !== undefined) {
      const isEnabled = (sc.applicationEnforcedRestrictions as Record<string, unknown>)?.isEnabled === true;
      criteria.push({ label: "app-enforced restrictions enabled", pass: session.appEnforcedRestrictions === isEnabled });
    }
    if (session.signInFrequencyHours !== undefined) {
      const freq = sc.signInFrequency as Record<string, unknown> | undefined;
      if (session.signInFrequencyHours === 0) {
        const everyTime = freq?.isEnabled === true && (freq?.frequencyInterval === "everyTime" || freq?.isEveryTime === true);
        criteria.push({ label: "sign-in frequency: every time", pass: everyTime });
      } else {
        const isEnabled = freq?.isEnabled === true;
        const hours = freq?.type === "hours" ? (freq?.value as number ?? NaN) : freq?.type === "days" ? ((freq?.value as number ?? 0) * 24) : NaN;
        criteria.push({ label: `sign-in frequency ≤ ${session.signInFrequencyHours}h`, pass: isEnabled && hours <= (session.signInFrequencyHours as number) });
      }
    }
    if (session.persistentBrowser !== undefined) {
      const persistent = sc.persistentBrowser as Record<string, unknown> | undefined;
      const isDisabled = persistent?.isEnabled === true && persistent?.mode === "never";
      criteria.push({ label: "persistent browser disabled", pass: session.persistentBrowser === false ? isDisabled : !isDisabled });
    }
  }

  // State
  if (m.state === "active") {
    const state = policy.state as string ?? "disabled";
    criteria.push({ label: "policy is active", pass: state === "enabled" || state === "enabledForReportingButNotEnforced" });
  }

  return criteria;
}

function runCaMatch(
  matchSpec: Record<string, unknown>,
  snapshot: EvidenceSnapshot,
  config: CaMatchConfig,
): { pass: boolean; warnings: string[] } {
  const policies = (snapshot.data?.caPolicies ?? snapshot.data?.conditionalAccessPolicies ?? []) as Record<string, unknown>[];

  for (const policy of policies) {
    const criteria = evaluateCaPolicy(policy, matchSpec, config);
    const scorable = criteria.filter((c) => !c.warn);
    if (scorable.every((c) => c.pass)) {
      return {
        pass: true,
        warnings: criteria.filter((c) => c.warn).map((c) => c.label),
      };
    }
  }

  return { pass: false, warnings: [] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a single assertion against an evidence snapshot.
 *
 * This is the core evaluation function. It handles all operator types:
 * - Simple operators (eq, neq, in, lte, gte, notEmpty, contains, etc.)
 * - Count assertions ({min, max} range checks)
 * - AllowedValues (set membership)
 * - CA policy match (Conditional Access policy evaluation)
 * - Custom evaluators (delegated to the evaluator registry)
 * - Nested find (search within nested arrays)
 * - Manual checks (flagged for human review)
 * - Additional assertions (AND-combined multi-property checks)
 *
 * @param assertion - The assertion to evaluate
 * @param snapshot  - The evidence snapshot containing collected data
 * @param config    - Engine configuration (break-glass accounts, etc.)
 * @returns EngineResult with pass/fail, warnings, and actual values
 */
export function evaluateControl(
  assertion: EngineAssertion,
  snapshot: EvidenceSnapshot,
  config: EngineConfig,
): EngineResult {
  const base = {
    checkSlug: assertion.checkSlug,
    evaluatedAt: new Date().toISOString(),
  };

  // CA policy match — match spec is data in expectedValue/caMatchSpec
  if (assertion.operator === "ca-match") {
    const matchSpec = (assertion.caMatchSpec ?? assertion.expectedValue) as Record<string, unknown>;
    if (!matchSpec || typeof matchSpec !== "object") {
      return { ...base, pass: false, actualValues: {}, warnings: ["ca-match operator requires a match spec in expectedValue"] };
    }
    const { pass, warnings } = runCaMatch(matchSpec, snapshot, config);
    return { ...base, pass, actualValues: {}, warnings };
  }

  // Complex evaluator — delegate to evaluator registry
  if (assertion.evaluatorSlug) {
    const evaluator = getBuiltinEvaluator(assertion.evaluatorSlug);
    if (!evaluator) {
      // Try async evaluator (sandboxed plugin)
      const asyncEval = getEvaluator(assertion.evaluatorSlug);
      if (!asyncEval) {
        return { ...base, pass: false, actualValues: {}, warnings: [`Unknown evaluator slug: "${assertion.evaluatorSlug}"`] };
      }
      // Sandboxed evaluators are async — this is not supported in sync path.
      // The scan pipeline handles async evaluators separately.
      if (isSandboxed(assertion.evaluatorSlug)) {
        return { ...base, pass: false, actualValues: {}, warnings: [`Evaluator "${assertion.evaluatorSlug}" is sandboxed and requires async execution`] };
      }
    }
    if (evaluator) {
      const { pass, warnings } = evaluator(snapshot as { data?: Record<string, unknown> });
      return { ...base, pass, actualValues: {}, warnings };
    }
  }

  // Nested find — find item in nested array, assert on property
  if (assertion.operator === "nestedFind" && assertion.nestedFind) {
    const sourceData = toArray(snapshot.data?.[assertion.source]) as Record<string, unknown>[];
    if (sourceData.length === 0) {
      return { ...base, pass: false, actualValues: {}, warnings: [`source "${assertion.source}" not available or empty`] };
    }
    const { arrayPath, findBy, property } = assertion.nestedFind;
    const failures: string[] = [];
    const actualValues: Record<string, unknown> = {};

    for (const item of sourceData) {
      const nestedArray = (getProperty(item, arrayPath) ?? []) as Record<string, unknown>[];
      if (!Array.isArray(nestedArray)) {
        failures.push(`${arrayPath} is not an array in source "${assertion.source}"`);
        continue;
      }
      const found = nestedArray.find((el) =>
        Object.entries(findBy).every(([k, v]) =>
          typeof v === "string"
            ? String(getProperty(el, k) ?? "").toLowerCase() === v.toLowerCase()
            : getProperty(el, k) === v,
        ),
      );
      if (!found) {
        actualValues[`${arrayPath}[${JSON.stringify(findBy)}]`] = null;
        const notFoundIsPass = assertion.expectedValue === "disabled" || assertion.expectedValue === false || assertion.expectedValue === null;
        if (!notFoundIsPass) {
          failures.push(`${arrayPath}[${JSON.stringify(findBy)}] — item not found, expected ${JSON.stringify(assertion.expectedValue)}`);
        }
        continue;
      }
      const actual = getProperty(found, property);
      actualValues[`${arrayPath}[${JSON.stringify(findBy)}].${property}`] = actual;
      const pass = evalOperator(actual, "eq", assertion.expectedValue);
      if (!pass) {
        failures.push(`${arrayPath}[${JSON.stringify(findBy)}].${property} is ${JSON.stringify(actual)}, expected ${JSON.stringify(assertion.expectedValue)}`);
      }
    }
    return { ...base, pass: failures.length === 0, actualValues, warnings: failures };
  }

  // Count assertion
  if (assertion.operator === "count") {
    const sourceData = toArray(snapshot.data?.[assertion.source]);
    const filtered = applySourceFilter(sourceData, assertion.sourceFilter as Record<string, unknown> | undefined);
    const count = filtered.length;
    const { min, max } = (assertion.expectedValue as { min?: number; max?: number }) ?? {};
    const pass = (min === undefined || count >= min) && (max === undefined || count <= max);
    const range = `${min ?? 0}–${max ?? "∞"}`;
    return {
      ...base,
      pass,
      actualValues: { count },
      warnings: pass ? [] : [`found ${count} — expected between ${range}`],
    };
  }

  // AllowedValues
  if (assertion.operator === "allowedValues") {
    const rawData = toArray(snapshot.data?.[assertion.source]) as Record<string, unknown>[];
    const sourceData = applySourceFilter(rawData, assertion.sourceFilter as Record<string, unknown> | undefined) as Record<string, unknown>[];
    if (sourceData.length === 0) {
      return { ...base, pass: false, actualValues: {}, warnings: [`source "${assertion.source}" not available or empty`] };
    }
    const allowed = (assertion.expectedValue ?? []) as unknown[];
    const failures: string[] = [];
    const actualValues: Record<string, unknown> = {};
    for (const item of sourceData) {
      let actual = getProperty((item as Record<string, unknown>).principal ?? item, assertion.property);
      // Microsoft Graph returns license assignments as [{skuId: "...", ...}] arrays.
      // Extract skuId for comparison against allowedValues lists.
      if (Array.isArray(actual)) actual = actual.map((x: unknown) => (x as Record<string, unknown>)?.skuId ?? x);
      const label = (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).userPrincipalName ?? (item as Record<string, unknown>).displayName ?? "item";
      actualValues[label as string] = actual;
      const values = Array.isArray(actual) ? actual : [actual];
      const invalid = values.filter((v: unknown) => v != null && !allowed.includes(v));
      if (invalid.length > 0) {
        failures.push(`${label}: ${assertion.property} contains disallowed value(s): ${JSON.stringify(invalid)}`);
      }
    }
    return { ...base, pass: failures.length === 0, actualValues, warnings: failures };
  }

  // Manual
  if (assertion.operator === "manual") {
    return { ...base, pass: false, actualValues: {}, warnings: ["Manual check required — no API available for this control"] };
  }

  // Simple operator evaluation
  const rawSourceData = toArray(snapshot.data?.[assertion.source]) as Record<string, unknown>[];
  const sourceData = applySourceFilter(rawSourceData, assertion.sourceFilter as Record<string, unknown> | undefined) as Record<string, unknown>[];
  const failures: string[] = [];
  const actualValues: Record<string, unknown> = {};

  if (sourceData.length === 0) {
    return { ...base, pass: false, actualValues: {}, warnings: [`source "${assertion.source}" not available or empty`] };
  }

  for (const item of sourceData) {
    const actual = getProperty(item, assertion.property);
    const label = (item as Record<string, unknown>).id ??
      (item as Record<string, unknown>).userPrincipalName ??
      (item as Record<string, unknown>).displayName ??
      (item as Record<string, unknown>).name ??
      "item";
    actualValues[label as string] = actual;

    const pass = evalOperator(actual, assertion.operator, assertion.expectedValue);
    if (!pass) {
      failures.push(`${label}: ${assertion.property} is ${JSON.stringify(actual)}, expected ${assertion.operator} ${JSON.stringify(assertion.expectedValue)}`);
    }

    // For singleton sources only check first item
    if (!Array.isArray(sourceData) || sourceData.length === 1) break;
  }

  const primaryPass =
    assertion.assertionLogic === "ANY"
      ? failures.length < sourceData.length
      : failures.length === 0;

  // Additional assertions (AND-combined)
  if (assertion.additionalAssertions && assertion.additionalAssertions.length > 0) {
    const additionalFailures: string[] = [];
    for (const sub of assertion.additionalAssertions) {
      const subSource = sub.source ?? assertion.source;
      let subData = toArray(snapshot.data?.[subSource]);
      subData = applySourceFilter(subData, sub.sourceFilter as Record<string, unknown> | undefined);

      if (subData.length === 0) {
        additionalFailures.push(`source "${subSource}" not available or empty for additional assertion on ${sub.property}`);
        continue;
      }

      for (const item of subData) {
        const actual = getProperty(item, sub.property);
        const label = (item as Record<string, unknown>).id ??
          (item as Record<string, unknown>).userPrincipalName ??
          (item as Record<string, unknown>).displayName ??
          (item as Record<string, unknown>).name ??
          "item";
        const subPass = evalOperator(actual, sub.operator, sub.expectedValue);
        if (!subPass) {
          additionalFailures.push(`${label}: ${sub.property} is ${JSON.stringify(actual)}, expected ${sub.operator} ${JSON.stringify(sub.expectedValue)}`);
        }
        if ((subData as unknown[]).length === 1) break;
      }
    }
    const allPass = primaryPass && additionalFailures.length === 0;
    return { ...base, pass: allPass, actualValues, warnings: [...failures, ...additionalFailures] };
  }

  return { ...base, pass: primaryPass, actualValues, warnings: failures };
}

/**
 * Evaluate all assertions against an evidence snapshot.
 *
 * Groups assertions by checkSlug and returns one result per check.
 * Multiple assertions for the same check are AND-combined (all must
 * pass for the check to pass).
 *
 * @param assertions - Array of assertions to evaluate
 * @param snapshot   - The evidence snapshot containing collected data
 * @param config     - Engine configuration
 * @returns Map of checkSlug → EngineResult
 */
export function evaluateAssertions(
  assertions: readonly EngineAssertion[],
  snapshot: EvidenceSnapshot,
  config: EngineConfig,
): Map<string, EngineResult> {
  const results = new Map<string, EngineResult>();

  // Group assertions by checkSlug — multiple assertions per check
  // are AND-combined (all must pass)
  const byCheck = new Map<string, EngineAssertion[]>();
  for (const assertion of assertions) {
    const existing = byCheck.get(assertion.checkSlug) ?? [];
    existing.push(assertion);
    byCheck.set(assertion.checkSlug, existing);
  }

  for (const [checkSlug, checkAssertions] of byCheck) {
    const checkResults = checkAssertions.map((a) =>
      evaluateControl(a, snapshot, config),
    );

    // AND-combine: check passes only if ALL assertions pass
    const allPass = checkResults.every((r) => r.pass);
    const allWarnings = checkResults.flatMap((r) => r.warnings);
    const mergedActualValues = checkResults.reduce(
      (acc, r) => ({ ...acc, ...r.actualValues }),
      {} as Record<string, unknown>,
    );

    results.set(checkSlug, {
      checkSlug,
      pass: allPass,
      warnings: allWarnings,
      actualValues: mergedActualValues,
      evaluatedAt: new Date().toISOString(),
    });
  }

  return results;
}
