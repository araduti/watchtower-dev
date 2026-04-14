/**
 * argus.engine-v2.ts
 *
 * Parallel engine that reads evidence.json (watchtower-v2.ts output)
 * instead of snapshot.json. Produces results-v2.json for comparison.
 *
 * Key differences from argus.engine.ts:
 *   1. Reads evidence.json — shape: { sources: { [key]: { rawValue, status } } }
 *   2. Adapts evidence shape to snapshot.data shape for engine compatibility
 *   3. getControlAssertions() mocks the future DB query for ControlAssertion rows
 *   4. Simple operator assertions evaluated directly — no spec files needed
 *   5. Complex/custom evaluators still run from the existing engine
 *   6. Output: results-v2.json with per-control results + framework mappings
 *
 * When the DB exists, replace getControlAssertions() body with:
 *   return prisma.controlAssertion.findMany({ include: { control: { include: { framework: true } } } })
 *
 * Run alongside argus.ts to compare results:
 *   bun run argus.ts          → results from snapshot.json + spec files
 *   bun run argus.engine-v2.ts → results from evidence.json + DB assertions
 *
 */

// ─── Config ───────────────────────────────────────────────────────────────────

import { MOCKED_CONTROL_ASSERTIONS } from "./assertions.ts";
import { getEvaluator, registrySize } from "./evaluators/registry.ts";
import { CA_POLICY_SPECS } from "./evaluators/ca-policy-specs.ts";

// ─── Inlined from argus.engine.ts ──────────────────────────────────────────────
// CA policy match engine and assert runner.
// Custom evaluators have been extracted to evaluators/builtin/ and are loaded
// via the evaluator registry (evaluators/registry.ts).

interface ArgusConfig {
  breakGlassAccounts: string[];
}

// ─── Spec Language ────────────────────────────────────────────────────────────

interface PolicySpec {
  id: string;
  framework: string;
  frameworkVersion: string;
  product: string;
  title: string;
  // CA policy evaluation
  match?: {
    users?: { include?: "All"; roles?: string[] };
    userActions?: string[];
    apps?: { include?: "All"; noExclusions?: boolean };
    grant?: {
      anyOf?: string[];
      authStrength?: string;
      operator?: "OR" | "AND";
    };
    authenticationFlows?: string[]; // e.g. ["deviceCodeFlow"]
    userRisk?: string[];    // e.g. ["high"]
    signInRisk?: string[]; // e.g. ["high"]
    clientAppTypes?: string[];
    session?: { appEnforcedRestrictions?: boolean; signInFrequencyHours?: number; persistentBrowser?: boolean };
    exclusions?: "break-glass-only";
    state?: "active";
  };
  // Custom named evaluator (for complex checks that don't fit assert)
  custom?: string;                          // name of a registered evaluator function
  // User/object property evaluation
  source?: string;                          // snapshot key to evaluate against e.g. "privilegedUsers"
  assert?: {
    property?: string;                      // property path on each object e.g. "onPremisesSyncEnabled"
    value?: any;                            // expected value
    negate?: boolean;                       // if true, FAIL when value matches (flag bad actors, not good ones)
    scope?: "principal";                    // if source items are role assignments, evaluate principal
    filter?: Record<string, any>;          // filter items before asserting e.g. { roleTemplateId: "..." }
    count?: { min?: number; max?: number }; // assert count of (filtered) items is within range
    allowedValues?: any[];                  // property value must be in this set (or empty/null)
    max?: number;                           // property numeric value must be <= max
    min?: number;                           // property numeric value must be >= min
    notEmpty?: boolean;                     // property must be non-empty array/string
    also?: Array<{                          // additional property checks on same object
      property: string;
      value?: any;
      notEmpty?: boolean;
      max?: number;
      min?: number;
    }>;
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface Criterion {
  label: string;
  pass: boolean;
  warn?: boolean;
}

interface V1ControlResult {
  id: string;
  framework: string;
  frameworkVersion: string;
  product: string;
  title: string;
  pass: boolean;
  matchedPolicy?: string;
  warnings: string[];
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

function evaluate(policy: any, spec: PolicySpec, config: ArgusConfig): Criterion[] {
  const criteria: Criterion[] = [];
  const m = spec.match;
  if (!m) return criteria;

  if (m.users?.include === "All") {
    const users: string[] = policy.conditions?.users?.includeUsers ?? [];
    criteria.push({ label: "targets all users", pass: users.includes("All") });
  }

  if (m.users?.roles) {
    const included: string[] = policy.conditions?.users?.includeRoles ?? [];
    const missing = m.users.roles.filter(r => !included.includes(r));
    criteria.push({ label: `covers required roles (${missing.length} missing)`, pass: missing.length === 0 });
  }

  if (m.userActions) {
    const actions: string[] = policy.conditions?.applications?.includeUserActions ?? [];
    const actionsLower = actions.map(a => a.toLowerCase());
    const allPresent = m.userActions.every(a => actionsLower.includes(a.toLowerCase()));
    criteria.push({ label: `targets user action: ${m.userActions.join(", ")}`, pass: allPresent });
  }

  if (m.apps?.include) {
    const apps: string[] = policy.conditions?.applications?.includeApplications ?? [];
    const target = m.apps.include;
    criteria.push({
      label: `targets ${target}`,
      pass: apps.includes(target),
    });
  }


  if (m.apps?.noExclusions) {
    const exc: string[] = policy.conditions?.applications?.excludeApplications ?? [];
    criteria.push({ label: "no app exclusions", pass: exc.length === 0 });
  }

  if (m.grant?.anyOf) {
    const builtIn: string[] = policy.grantControls?.builtInControls ?? [];
    const hit = m.grant.anyOf.find(c => builtIn.includes(c));
    criteria.push({ label: `requires ${m.grant.anyOf.join(" or ")}`, pass: !!hit });
  }

  if (m.grant?.operator) {
    const operator: string = policy.grantControls?.operator ?? "";
    criteria.push({ label: `grant operator is ${m.grant.operator}`, pass: operator === m.grant.operator });
  }

  if (m.grant?.authStrength) {
    const id = policy.grantControls?.authenticationStrength?.id;
    criteria.push({ label: "requires phishing-resistant MFA", pass: id === m.grant.authStrength });
  }

  if (m.exclusions === "break-glass-only") {
    const excludedUsers: string[] = policy.conditions?.users?.excludeUsers ?? [];
    const excludedGroups: string[] = policy.conditions?.users?.excludeGroups ?? [];
    const allExcluded = [...excludedUsers, ...excludedGroups];

    if (config.breakGlassAccounts.length === 0) {
      criteria.push({
        label: `exclusions (${allExcluded.length}) — break-glass not configured`,
        pass: true,
        warn: allExcluded.length > 0,
      });
    } else {
      const unexpected = allExcluded.filter(id => !config.breakGlassAccounts.includes(id));
      const missingBreakGlass = config.breakGlassAccounts.filter(id => !allExcluded.includes(id));
      criteria.push({
        label: unexpected.length === 0
          ? `exclusions are break-glass only (${allExcluded.length} excluded)`
          : `${unexpected.length} non-break-glass exclusion(s) found`,
        pass: unexpected.length === 0,
        warn: missingBreakGlass.length > 0,
      });
    }
  }

  // ── Client app types (e.g. "exchangeActiveSync", "other", "browser") ────
  if (m.clientAppTypes) {
    const conditions = policy.conditions?.clientAppTypes ?? [];
    const allPresent = m.clientAppTypes.every((t: string) =>
      conditions.some((c: string) => c.toLowerCase() === t.toLowerCase())
    );
    criteria.push({
      label: `client app types: ${m.clientAppTypes.join(", ")}`,
      pass: allPresent,
    });
  }

  // ── Authentication flows (e.g. "deviceCodeFlow") ───────────────────────
  if (m.authenticationFlows) {
    const raw = policy.conditions?.authenticationFlows?.transferMethods;
    const transfers: string[] = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",").map(s => s.trim()) : [];
    const allPresent = m.authenticationFlows.every((f: string) =>
      transfers.some((t: string) => t.toLowerCase() === f.toLowerCase())
    );
    criteria.push({
      label: `authentication flows: ${m.authenticationFlows.join(", ")}`,
      pass: allPresent,
    });
  }

  // ── User risk levels (e.g. ["high"]) ───────────────────────────────────
  if (m.userRisk) {
    const levels: string[] = policy.conditions?.userRiskLevels ?? [];
    const allPresent = m.userRisk.every((r: string) =>
      levels.some((l: string) => l.toLowerCase() === r.toLowerCase())
    );
    criteria.push({
      label: `user risk levels: ${m.userRisk.join(", ")}`,
      pass: allPresent,
    });
  }

  // ── Sign-in risk levels (e.g. ["high", "medium"]) ─────────────────────
  if (m.signInRisk) {
    const levels: string[] = policy.conditions?.signInRiskLevels ?? [];
    const allPresent = m.signInRisk.every((r: string) =>
      levels.some((l: string) => l.toLowerCase() === r.toLowerCase())
    );
    criteria.push({
      label: `sign-in risk levels: ${m.signInRisk.join(", ")}`,
      pass: allPresent,
    });
  }

  // ── Session controls ──────────────────────────────────────────────────
  if (m.session) {
    const sc = policy.sessionControls ?? {};

    if (m.session.appEnforcedRestrictions !== undefined) {
      const isEnabled = sc.applicationEnforcedRestrictions?.isEnabled === true;
      criteria.push({
        label: "app-enforced restrictions enabled",
        pass: m.session.appEnforcedRestrictions === isEnabled,
      });
    }

    if (m.session.signInFrequencyHours !== undefined) {
      const freq = sc.signInFrequency;
      if (m.session.signInFrequencyHours === 0) {
        // 0 means "every time" — signInFrequency must be enabled with isEveryTime or type=everyTime
        const everyTime = freq?.isEnabled === true &&
          (freq?.frequencyInterval === "everyTime" || freq?.isEveryTime === true);
        criteria.push({
          label: "sign-in frequency: every time",
          pass: everyTime,
        });
      } else {
        // Specific hour limit
        const isEnabled = freq?.isEnabled === true;
        // Convert to hours; unknown frequency types treated as non-compliant (NaN fails <=)
        const hours = freq?.type === "hours"
          ? (freq?.value ?? NaN)
          : freq?.type === "days"
            ? (freq?.value ?? 0) * 24
            : NaN;
        criteria.push({
          label: `sign-in frequency ≤ ${m.session.signInFrequencyHours}h`,
          pass: isEnabled && hours <= m.session.signInFrequencyHours,
        });
      }
    }

    if (m.session.persistentBrowser !== undefined) {
      const persistent = sc.persistentBrowser;
      const isDisabled = persistent?.isEnabled === true && persistent?.mode === "never";
      criteria.push({
        label: "persistent browser disabled",
        pass: m.session.persistentBrowser === false ? isDisabled : !isDisabled,
      });
    }
  }

  if (m.state === "active") {
    const state: string = policy.state ?? "disabled";
    criteria.push({
      label: "policy is active",
      pass: state === "enabled" || state === "enabledForReportingButNotEnforced",
    });
  }

  return criteria;
}

// ─── Assert evaluator (user/object property checks) ──────────────────────────

function runAssert(spec: PolicySpec, snapshot: Record<string, any>): V1ControlResult {
  const assert = spec.assert!;
  let items: any[] = snapshot.data?.[spec.source!] ?? [];

  // Apply filter — checks item, its principal, and array fields (e.g. groupTypes)
  if (assert.filter) {
    items = items.filter(item => {
      return Object.entries(assert.filter!).every(([k, v]) => {
        const itemVal = item?.[k];
        const principalVal = item?.principal?.[k];
        // Support array-contains check (e.g. groupTypes includes "Unified")
        if (Array.isArray(itemVal)) return itemVal.includes(v);
        if (Array.isArray(principalVal)) return principalVal.includes(v);
        return itemVal === v || principalVal === v;
      });
    });
  }

  const base: Omit<V1ControlResult, "pass" | "warnings"> = {
    id: spec.id,
    framework: spec.framework,
    frameworkVersion: spec.frameworkVersion,
    product: spec.product,
    title: spec.title,
  };

  // Count assertion — check number of (filtered) items is within range
  if (assert.count) {
    const { min, max } = assert.count;
    const n = items.length;
    const pass = (min === undefined || n >= min) && (max === undefined || n <= max);
    return {
      ...base,
      pass,
      warnings: pass ? [] : [`found ${n} — expected between ${min ?? 0} and ${max ?? "∞"}`],
    };
  }

  // AllowedValues assertion — each item's property must be empty or only contain allowed values
  if (assert.allowedValues && assert.property) {
    const seen = new Set<string>();
    const failing: string[] = [];

    for (const item of items) {
      const target = assert.scope === "principal" ? item.principal : item;
      if (!target) continue;

      const uid = target.id ?? target.userPrincipalName;
      if (uid && seen.has(uid)) continue;
      if (uid) seen.add(uid);

      const raw = assert.property!.split(".").reduce((obj: any, k: string) => obj?.[k], target);
      const label = target.userPrincipalName ?? target.displayName ?? target.id ?? target.name ?? "tenant";

      if (Array.isArray(raw)) {
        // Array property — each element must be in allowedValues (e.g. assignedLicenses)
        const disallowed = raw.filter((v: any) => {
          const key = v?.skuId ?? v;
          return !assert.allowedValues!.includes(key);
        });
        if (disallowed.length > 0) {
          const keys = disallowed.map((v: any) => v?.skuId ?? v).join(", ");
          failing.push(`${label} — has disallowed value(s): ${keys}`);
        }
      } else {
        // Scalar property — value itself must be in allowedValues (e.g. guestUserRoleId)
        if (!assert.allowedValues!.includes(raw)) {
          failing.push(`${label} — ${assert.property} is ${JSON.stringify(raw)}, must be one of: ${assert.allowedValues!.join(", ")}`);
        }
      }
    }

    return { ...base, pass: failing.length === 0, warnings: failing };
  }

  // Property assertion — dedupe by id, check property on each unique item
  // null and false are treated as equivalent (Graph returns null for cloud-only accounts)
  // negate: true — FAIL if value matches (used to flag bad actors e.g. Public groups)
  const seen = new Set<string>();
  const failing: string[] = [];

  for (const item of items) {
    const target = assert.scope === "principal" ? item.principal : item;
    if (!target) continue;

    const uid = target.id ?? target.userPrincipalName ?? target.displayName;
    if (uid && seen.has(uid)) continue;
    if (uid) seen.add(uid);

    // Support dot notation for nested properties e.g. "defaultUserRolePermissions.allowedToCreateApps"
    const actual = assert.property!.split(".").reduce((obj: any, key: string) => obj?.[key], target);
    const label = target.displayName ?? target.userPrincipalName ?? target.id ?? target.name ?? "tenant";

    // notEmpty: false means the value must be empty (null, undefined, or empty array/string)
    if (assert.notEmpty === false) {
      const isEmpty = actual == null || (Array.isArray(actual) ? actual.length === 0 : actual === "");
      if (!isEmpty) {
        failing.push(`${label} — ${assert.property} must be empty but has value: ${JSON.stringify(actual)}`);
      }
      continue;
    }

    // notEmpty: true means the value must be non-empty
    if (assert.notEmpty === true) {
      const isEmpty = actual == null || (Array.isArray(actual) ? actual.length === 0 : actual === "");
      if (isEmpty) {
        failing.push(`${label} — ${assert.property} is empty`);
      }
      continue;
    }

    // max/min numeric checks
    if (assert.max !== undefined && (typeof actual !== "number" || actual > assert.max)) {
      failing.push(`${label} — ${assert.property} is ${JSON.stringify(actual)}, must be ${assert.max} or less`);
      continue;
    }
    if (assert.min !== undefined && (typeof actual !== "number" || actual < assert.min)) {
      failing.push(`${label} — ${assert.property} is ${JSON.stringify(actual)}, must be ${assert.min} or more`);
      continue;
    }

    if (assert.max === undefined && assert.min === undefined) {
      const normalised = (assert.value === false && actual === null) ? false : actual;
      const matches = normalised === assert.value;
      const fail = assert.negate ? matches : !matches;
      if (fail) {
        const msg = assert.negate
          ? `${label} — ${assert.property} is ${JSON.stringify(actual)} (should not be)`
          : `${label} — ${assert.property} is ${JSON.stringify(actual)}, expected ${JSON.stringify(assert.value)}`;
        failing.push(msg);
      }
    }
  }

  return { ...base, pass: failing.length === 0, warnings: failing };
}

// ─── Custom evaluators ───────────────────────────────────────────────────────
// Extracted to packages/engine/evaluators/builtin/ and loaded via the registry.
// The registry is imported at the top of this file. Evaluator lookup is via
// getEvaluator(slug) which returns the evaluate function or undefined.

// ─── Runner ───────────────────────────────────────────────────────────────────

function runSpec(spec: PolicySpec, policies: any[], config: ArgusConfig, snapshot?: Record<string, any>): V1ControlResult {
  const base: Omit<V1ControlResult, "pass" | "warnings"> = {
    id: spec.id,
    framework: spec.framework,
    frameworkVersion: spec.frameworkVersion,
    product: spec.product,
    title: spec.title,
  };

  // Custom evaluator mode — look up in the evaluator registry
  if (spec.custom) {
    const evaluator = getEvaluator(spec.custom);
    if (!evaluator) return { ...base, pass: false, warnings: [`Unknown custom evaluator: "${spec.custom}"`] };
    const { pass, warnings } = evaluator(snapshot ?? {});
    return { ...base, pass, warnings };
  }

  // Manual controls — no automation path, surface for human review
  if ((spec as any).manual) {
    return { ...base, pass: false, warnings: ["Manual check required — no API available for this control"] };
  }

  // Skip if required connector data not yet available in snapshot
  if ((spec as any).requiresConnector && !snapshot?.data?.[(spec as any).source]) {
    return { ...base, pass: false, warnings: [`Requires connector: ${(spec as any).requiresConnector} — data not yet available in snapshot`] };
  }

  // Fail if source is defined but missing or empty in snapshot (e.g. missing scope, failed workload)
  if ((spec as any).source && snapshot?.data) {
    const sourceData = snapshot.data[(spec as any).source];
    const isMissing = sourceData === undefined || sourceData === null;
    const isEmpty = Array.isArray(sourceData) && sourceData.length === 0;
    if ((isMissing || isEmpty) && (spec as any).requiresScope) {
      return { ...base, pass: false, warnings: [`Requires Graph scope: ${(spec as any).requiresScope} — add to app registration and re-run Watchtower`] };
    }
  }

  // Assert mode — evaluate object properties across a snapshot collection
  if (spec.source && spec.assert) {
    return runAssert(spec, snapshot ?? {});
  }

  // Match mode — find a CA policy satisfying all criteria
  for (const policy of policies) {
    const criteria = evaluate(policy, spec, config);
    const scorable = criteria.filter(c => !c.warn);
    if (scorable.every(c => c.pass)) {
      return {
        id: spec.id,
        framework: spec.framework,
        frameworkVersion: spec.frameworkVersion,
        product: spec.product,
        title: spec.title,
        pass: true,
        matchedPolicy: policy.displayName,
        warnings: criteria.filter(c => c.warn).map(c => c.label),
      };
    }
  }

  return {
    id: spec.id,
    framework: spec.framework,
    frameworkVersion: spec.frameworkVersion,
    product: spec.product,
    title: spec.title,
    pass: false,
    warnings: [],
  };
}

function runAudit(specs: PolicySpec[], snapshot: Record<string, any>, config: ArgusConfig): V1ControlResult[] {
  const policies: any[] = snapshot.data?.caPolicies ?? [];
  return specs.map(spec => runSpec(spec, policies, config, snapshot));
}

// ─── End inlined argus.engine.ts ────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvidenceSource {
  rawValue:    any[];
  collectedAt: string;
  durationMs:  number;
  status:      "ok" | "failed";
  error:       string | null;
}

interface Evidence {
  collectedAt: string;
  durationMs:  number;
  sourceCount: number;
  sources:     Record<string, EvidenceSource>;
}

export type Operator = "eq" | "neq" | "in" | "lte" | "gte" | "notEmpty" | "manual" | "count" | "allowedValues" | "custom" | "contains" | "notContainsAny" | "nestedFind";

export interface ControlAssertion {
  // Control identity
  controlId:     string;   // framework control ID e.g. "7.2.3"
  controlTitle:  string;
  frameworkSlug: string;   // e.g. "cis-m365-3.0"
  level:         string | null;  // "L1", "SHALL", null
  required:      boolean;

  // What to evaluate
  source:        string;   // evidence source key e.g. "spoTenant"
  property:      string;   // property path e.g. "sharingCapability"
  operator:      Operator;
  expectedValue: any;      // scalar, array, or null

  // For complex evaluations handled by the existing engine
  evaluatorSlug?: string;  // name in evaluator registry (see evaluators/registry.ts)

  // Optional filter applied before asserting (e.g. {isVerified: true})
  sourceFilter?: Record<string, any>;

  // Assertion grouping (multiple assertions per control)
  assertionLogic: "ALL" | "ANY";  // default ALL

  // Phase 2.1 — Multi-assertion controls: additional property checks on the same control
  // Each sub-assertion is evaluated AND combined with the primary assertion
  additionalAssertions?: Array<{
    source?:        string;   // defaults to parent source if omitted (cross-source if provided)
    property:       string;
    operator:       Operator;
    expectedValue:  any;
    sourceFilter?:  Record<string, any>;
  }>;

  // Phase 2.2 — Nested array find: find an item in a nested array, then assert on a property of that item
  nestedFind?: {
    arrayPath:     string;   // path to the nested array e.g. "authenticationMethodConfigurations"
    findBy:        Record<string, any>;  // filter to locate the item e.g. { id: "email" }
    property:      string;   // property to assert on e.g. "state"
  };
}

interface ControlResult {
  controlId:     string;
  controlTitle:  string;
  frameworkSlug: string;
  level:         string | null;
  pass:          boolean;
  actualValues:  Record<string, any>;  // property → actual value
  failures:      string[];
  evaluatedAt:   string;
}

// ─── Mock DB ──────────────────────────────────────────────────────────────────
//
// getControlAssertions() simulates:
//   SELECT ca.*, c.controlId, c.controlTitle, c.frameworkId, c.level, f.slug as frameworkSlug
//   FROM ControlAssertion ca
//   JOIN Control c ON c.id = ca.controlId
//   JOIN Framework f ON f.id = c.frameworkId
//
// When the DB exists, replace this function body with the real Prisma query.
// Everything else in this file is unchanged.

async function getControlAssertions(): Promise<ControlAssertion[]> {
  // TODO: replace with real DB query when Control + ControlAssertion tables exist
  return MOCKED_CONTROL_ASSERTIONS;
}

// ── Assertions imported from assertions.ts ───────────────────────────────────
// To swap in real DB data, replace getControlAssertions() body with:
//   return prisma.controlAssertion.findMany({ include: { control: true } })

// ─── Evidence adapter ─────────────────────────────────────────────────────────
//
// Converts evidence.json shape to the snapshot.data shape the existing engine expects.
// This is a thin compatibility layer — not a permanent abstraction.
// When the engine is fully rewritten for DB-native evaluation, this goes away.

function evidenceToSnapshot(evidence: Evidence): Record<string, any> {
  const data: Record<string, any> = {};

  for (const [key, source] of Object.entries(evidence.sources)) {
    if (source.status === "ok") {
      // Singleton sources (objects, not arrays) — unwrap from array
      data[key] = source.rawValue.length === 1 &&
        !Array.isArray(source.rawValue[0]) &&
        typeof source.rawValue[0] === "object"
        ? source.rawValue  // keep as array — engine expects arrays for most sources
        : source.rawValue;
    }
  }

  return { data };
}

// ─── Simple operator evaluation ───────────────────────────────────────────────

function evalOperator(actual: any, operator: Operator, expected: any): boolean {
  switch (operator) {
    case "eq":       return actual === expected || (actual === null && expected === false);
    case "neq":      return actual !== expected && !(actual === null && expected === false);
    case "in":       return Array.isArray(expected) && expected.includes(actual);
    case "lte":      return typeof actual === "number" && actual <= expected;
    case "gte":      return typeof actual === "number" && actual >= expected;
    case "notEmpty": {
      const isEmpty = actual == null || actual === "" ||
                      (Array.isArray(actual) && actual.length === 0);
      // expectedValue=true  → must be non-empty (pass if non-empty)
      // expectedValue=false → must be empty     (pass if empty)
      return expected === false ? isEmpty : !isEmpty;
    }
    case "contains": {
      // String contains substring, or array contains element
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      if (Array.isArray(actual)) {
        return actual.some(item => item === expected);
      }
      return false;
    }
    case "notContainsAny": {
      // Array must not contain any of the specified values
      // expected is an array of disallowed values
      if (!Array.isArray(expected)) return true;
      if (Array.isArray(actual)) {
        return !actual.some(item =>
          expected.some((d: any) =>
            typeof item === "string" && typeof d === "string"
              ? item.toLowerCase().includes(d.toLowerCase())
              : item === d
          )
        );
      }
      if (typeof actual === "string") {
        return !expected.some((d: any) =>
          typeof d === "string" && actual.toLowerCase().includes(d.toLowerCase())
        );
      }
      return true;
    }
    default:         return false;
  }
}

function getProperty(obj: any, path: string): any {
  if (!path) return obj;
  // Parse path into segments: supports dot-notation and bracket-escaped keys
  // e.g. 'a.b.["@odata.type"]' → ["a", "b", "@odata.type"]
  const segments = path.match(/\["[^"]*"\]|[^.\[\]]+/g) ?? [];
  return segments.reduce((o, seg) => {
    const key = seg.startsWith('["') ? seg.slice(2, -2) : seg;
    return o?.[key];
  }, obj);
}


// ─── CA Policy Specs ──────────────────────────────────────────────────────────
// Extracted to evaluators/ca-policy-specs.ts and imported at the top of this file.

// ─── Source filter utility ─────────────────────────────────────────────────────
// Supports plain equality, array-includes, and operator objects:
//   { key: value }              → equality / array-includes
//   { key: { $ne: value } }    → not-equal
//   { key: { $in: [a, b] } }   → value is one of the listed values
//   { key: { $exists: true } }  → value is non-null/non-undefined

function applySourceFilter(items: any[], filter: Record<string, any> | undefined): any[] {
  if (!filter) return items;
  return items.filter(item =>
    Object.entries(filter).every(([k, v]) => {
      const itemVal = getProperty(item, k);

      // Operator objects: { $ne: ... }, { $in: [...] }, { $exists: bool }
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        if ("$ne" in v)     return itemVal !== v.$ne;
        if ("$in" in v)     return Array.isArray(v.$in) && v.$in.includes(itemVal);
        if ("$exists" in v) return v.$exists ? (itemVal != null) : (itemVal == null);
      }

      // Plain equality / array-includes
      if (Array.isArray(itemVal)) return itemVal.includes(v);
      return itemVal === v;
    })
  );
}

// ─── Control evaluator ────────────────────────────────────────────────────────

function evaluateControl(
  assertion:  ControlAssertion,
  snapshot:   Record<string, any>,
  config:     ArgusConfig,
): ControlResult {
  const base = {
    controlId:     assertion.controlId,
    controlTitle:  assertion.controlTitle,
    frameworkSlug: assertion.frameworkSlug,
    level:         assertion.level,
    evaluatedAt:   new Date().toISOString(),
  };

  // Complex evaluator — delegate to existing custom evaluator
  if (assertion.evaluatorSlug) {
    // CA policy match evaluators — route through the match engine
    if (assertion.evaluatorSlug.startsWith("ca-policy-match:")) {
      // Look up the spec from the CA_POLICY_SPECS map and run it through match engine
      const specId = assertion.evaluatorSlug.replace("ca-policy-match:", "");
      const spec = CA_POLICY_SPECS[specId];
      if (!spec) return { ...base, pass: false, actualValues: {}, failures: [`No CA policy spec found for id: ${specId}`] };
      const auditResults = runAudit([spec], snapshot, config);
      const result = auditResults[0];
      if (!result) return { ...base, pass: false, actualValues: {}, failures: [`CA policy match returned no result`] };
      return { ...base, pass: result.pass, actualValues: {}, failures: result.warnings };
    }

    // Custom named evaluators — look up in the evaluator registry
    const evaluator = getEvaluator(assertion.evaluatorSlug);
    if (!evaluator) return { ...base, pass: false, actualValues: {}, failures: [`Unknown evaluator slug: "${assertion.evaluatorSlug}"`] };
    const { pass, warnings } = evaluator(snapshot);
    return {
      ...base,
      pass,
      actualValues: {},
      failures:     warnings,
    };
  }

  // nestedFind — find an item in a nested array by key, then assert on a property of that item
  if (assertion.operator === "nestedFind" && assertion.nestedFind) {
    const sourceData: any[] = snapshot.data?.[assertion.source] ?? [];
    if (sourceData.length === 0) {
      return { ...base, pass: false, actualValues: {}, failures: [`source "${assertion.source}" not available or empty`] };
    }
    const { arrayPath, findBy, property } = assertion.nestedFind;
    const failures: string[] = [];
    const actualValues: Record<string, any> = {};

    for (const item of sourceData) {
      const nestedArray: any[] = getProperty(item, arrayPath) ?? [];
      if (!Array.isArray(nestedArray)) {
        failures.push(`${arrayPath} is not an array in source "${assertion.source}"`);
        continue;
      }
      const found = nestedArray.find((el: any) =>
        Object.entries(findBy).every(([k, v]) =>
          typeof v === "string"
            ? String(getProperty(el, k) ?? "").toLowerCase() === v.toLowerCase()
            : getProperty(el, k) === v
        )
      );
      if (!found) {
        // Not found: if expectedValue is "disabled" or false, not finding the item is a pass
        // (e.g. email OTP method not present = disabled = pass)
        // Otherwise it's a failure (expected item not found)
        actualValues[`${arrayPath}[${JSON.stringify(findBy)}]`] = null;
        const notFoundIsPass = assertion.expectedValue === "disabled" ||
          assertion.expectedValue === false ||
          assertion.expectedValue === null;
        if (!notFoundIsPass) {
          failures.push(
            `${arrayPath}[${JSON.stringify(findBy)}] — item not found, expected ${JSON.stringify(assertion.expectedValue)}`
          );
        }
        continue;
      }
      const actual = getProperty(found, property);
      actualValues[`${arrayPath}[${JSON.stringify(findBy)}].${property}`] = actual;
      const pass = evalOperator(actual, assertion.operator === "nestedFind" ? "eq" as Operator : assertion.operator, assertion.expectedValue);
      if (!pass) {
        failures.push(
          `${arrayPath}[${JSON.stringify(findBy)}].${property} is ${JSON.stringify(actual)}, ` +
          `expected ${JSON.stringify(assertion.expectedValue)}`
        );
      }
    }
    return { ...base, pass: failures.length === 0, actualValues, failures };
  }

  // count — assert the number of (optionally filtered) source items is within {min, max}
  if (assertion.operator === "count") {
    const sourceData: any[] = snapshot.data?.[assertion.source] ?? [];
    const filtered = applySourceFilter(sourceData, assertion.sourceFilter as Record<string, any> | undefined);
    const count = filtered.length;
    const { min, max } = (assertion.expectedValue as { min?: number; max?: number }) ?? {};
    const pass = (min === undefined || count >= min) && (max === undefined || count <= max);
    const range = `${min ?? 0}–${max ?? '∞'}`;
    return {
      ...base,
      pass,
      actualValues: { count },
      failures: pass ? [] : [`found ${count} — expected between ${range}`],
    };
  }

  // allowedValues — every item's property value must be in the allowed set (or null/empty)
  if (assertion.operator === "allowedValues") {
    const rawData: any[] = snapshot.data?.[assertion.source] ?? [];
    const sourceData = applySourceFilter(rawData, assertion.sourceFilter as Record<string, any> | undefined);
    if (sourceData.length === 0) {
      return { ...base, pass: false, actualValues: {}, failures: [`source "${assertion.source}" not available or empty`] };
    }
    const allowed: any[] = assertion.expectedValue ?? [];
    const failures: string[] = [];
    const actualValues: Record<string, any> = {};
    for (const item of sourceData) {
      // For array properties (e.g. assignedLicenses), extract skuId values
      let actual = getProperty(item.principal ?? item, assertion.property);
      if (Array.isArray(actual)) actual = actual.map((x: any) => x?.skuId ?? x);
      const label = item.id ?? item.userPrincipalName ?? item.displayName ?? "item";
      actualValues[label] = actual;
      const values = Array.isArray(actual) ? actual : [actual];
      const invalid = values.filter(v => v != null && !allowed.includes(v));
      if (invalid.length > 0) {
        failures.push(`${label}: ${assertion.property} contains disallowed value(s): ${JSON.stringify(invalid)}`);
      }
    }
    return { ...base, pass: failures.length === 0, actualValues, failures };
  }

  // Manual controls — no automation, surface for human review
  if (assertion.operator === "manual") {
    return {
      ...base,
      pass:         false,
      actualValues: {},
      failures:     ["Manual check required — no API available for this control"],
    };
  }

  // Simple operator evaluation
  const rawSourceData: any[] = snapshot.data?.[assertion.source] ?? [];
  const sourceData = applySourceFilter(rawSourceData, assertion.sourceFilter as Record<string, any> | undefined);
  const failures: string[] = [];
  const actualValues: Record<string, any> = {};

  if (sourceData.length === 0) {
    return {
      ...base,
      pass:         false,
      actualValues: {},
      failures:     [`source "${assertion.source}" not available or empty`],
    };
  }

  for (const item of sourceData) {
    const actual = getProperty(item, assertion.property);
    const label  = item.id ?? item.userPrincipalName ?? item.displayName ?? item.name ?? "item";

    actualValues[label] = actual;

    const pass = evalOperator(actual, assertion.operator, assertion.expectedValue);
    if (!pass) {
      failures.push(
        `${label}: ${assertion.property} is ${JSON.stringify(actual)}, ` +
        `expected ${assertion.operator} ${JSON.stringify(assertion.expectedValue)}`
      );
    }

    // For singleton sources (organizationConfig, spoTenant etc.) only check first item
    if (!Array.isArray(sourceData) || sourceData.length === 1) break;
  }

  const primaryPass = assertion.assertionLogic === "ANY"
    ? failures.length < sourceData.length  // ANY: at least one passed
    : failures.length === 0;               // ALL: every item passed

  // Phase 2.1/2.3 — Evaluate additional assertions (multi-property + cross-source)
  if (assertion.additionalAssertions && assertion.additionalAssertions.length > 0) {
    const additionalFailures: string[] = [];
    for (const sub of assertion.additionalAssertions) {
      const subSource = sub.source ?? assertion.source;
      let subData: any[] = snapshot.data?.[subSource] ?? [];

      // Apply sub-assertion's own sourceFilter
      subData = applySourceFilter(subData, sub.sourceFilter as Record<string, any> | undefined);

      if (subData.length === 0) {
        additionalFailures.push(`source "${subSource}" not available or empty for additional assertion on ${sub.property}`);
        continue;
      }

      for (const item of subData) {
        const actual = getProperty(item, sub.property);
        const label = item.id ?? item.userPrincipalName ?? item.displayName ?? item.name ?? "item";
        const subPass = evalOperator(actual, sub.operator, sub.expectedValue);
        if (!subPass) {
          additionalFailures.push(
            `${label}: ${sub.property} is ${JSON.stringify(actual)}, ` +
            `expected ${sub.operator} ${JSON.stringify(sub.expectedValue)}`
          );
        }
        if (subData.length === 1) break;
      }
    }
    const allPass = primaryPass && additionalFailures.length === 0;
    return { ...base, pass: allPass, actualValues, failures: [...failures, ...additionalFailures] };
  }

  return { ...base, pass: primaryPass, actualValues, failures };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const evidencePath  = process.env.EVIDENCE_PATH  ?? "evidence.json";
const resultsPath   = process.env.RESULTS_V2_PATH ?? "results-v2.json";

const config: ArgusConfig = {
  breakGlassAccounts: (process.env.BREAK_GLASS_ACCOUNTS ?? "").split(",").filter(Boolean),
};

console.log(`\n🔍 Argus Engine v2 — reading ${evidencePath}\n`);

const evidence: Evidence = JSON.parse(await Bun.file(evidencePath).text());
const snapshot = evidenceToSnapshot(evidence);
const assertions = await getControlAssertions();

console.log(`📋 ${assertions.length} control assertions loaded`);
console.log(`🔌 ${registrySize()} evaluators registered`);
console.log(`📦 ${Object.keys(evidence.sources).length} sources in evidence\n`);

// Evaluate all assertions
const results: ControlResult[] = assertions.map(a => evaluateControl(a, snapshot, config));

// Summary
const passed  = results.filter(r => r.pass).length;
const failed  = results.filter(r => !r.pass).length;
const byFramework = results.reduce((acc, r) => {
  if (!acc[r.frameworkSlug]) acc[r.frameworkSlug] = { pass: 0, fail: 0 };
  const entry = acc[r.frameworkSlug]!; r.pass ? entry.pass++ : entry.fail++;
  return acc;
}, {} as Record<string, { pass: number; fail: number }>);

console.log(`Results: ${passed} passed, ${failed} failed\n`);
console.log("By framework:");
for (const [fw, counts] of Object.entries(byFramework)) {
  const total = (counts?.pass ?? 0) + (counts?.fail ?? 0);
  const pct   = total > 0 ? ((( counts?.pass ?? 0) / total) * 100).toFixed(0) : "0";
  console.log(`  ${fw}: ${counts.pass}/${total} (${pct}%)`);
}

// Per-control output
console.log("\n--- Control Results ---");
for (const r of results.sort((a, b) => Number(a.pass) - Number(b.pass))) {
  const icon   = r.pass ? "✅" : "❌";
  const level  = r.level ? ` [${r.level}]` : "";
  console.log(`${icon} [${r.frameworkSlug}]${level} ${r.controlId} — ${r.controlTitle}`);
  if (!r.pass && r.failures.length > 0) {
    for (const f of r.failures.slice(0, 3)) {
      console.log(`   ↳ ${f}`);
    }
    if (r.failures.length > 3) {
      console.log(`   ↳ ...and ${r.failures.length - 3} more`);
    }
  }
}

// Write results
const output = {
  evaluatedAt:    new Date().toISOString(),
  evidencePath,
  controlCount:   assertions.length,
  passed,
  failed,
  byFramework,
  results,
};

await Bun.write(resultsPath, JSON.stringify(output, null, 2));
console.log(`\n📄 Results written to ${resultsPath}`);
