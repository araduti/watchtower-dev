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
 */

// ─── Config ───────────────────────────────────────────────────────────────────

import { MOCKED_CONTROL_ASSERTIONS } from "./assertions.ts";

// ─── Inlined from argus.engine.ts ──────────────────────────────────────────────
// CA policy match engine, custom evaluators, and assert runner.
// Inlined so argus.engine-v2.ts has zero external dependencies.

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
    const transfers = policy.conditions?.authenticationFlows?.transferMethods ?? [];
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
        const hours = freq?.type === "hours" ? freq?.value : (freq?.type === "days" ? (freq?.value ?? 0) * 24 : Infinity);
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
// Complex checks that can't be expressed as a simple assert.
// Each evaluator receives the full snapshot and returns pass + warnings.

type CustomEvaluator = (snapshot: Record<string, any>) => { pass: boolean; warnings: string[] };

const CUSTOM_EVALUATORS: Record<string, CustomEvaluator> = {

  "idle-session-timeout": (snapshot) => {
    const policies: any[] = snapshot.data?.timeoutPolicies ?? [];
    const MAX_SECONDS = 3 * 60 * 60; // 3 hours

    if (policies.length === 0) {
      return { pass: false, warnings: ["No activity-based timeout policy found"] };
    }

    const warnings: string[] = [];
    for (const policy of policies) {
      try {
        const def = JSON.parse(policy.definition?.[0] ?? "{}");
        const appPolicies = def?.ActivityBasedTimeoutPolicy?.ApplicationPolicies ?? [];
        // c44b4083-3bb0-49c1-b47d-974e53cbdf3c = Azure Portal — has its own timeout setting, not in scope
        const AZURE_PORTAL_ID = "c44b4083-3bb0-49c1-b47d-974e53cbdf3c";
        for (const app of appPolicies) {
          if (app?.ApplicationId === AZURE_PORTAL_ID) continue;
          const timeout = app?.WebSessionIdleTimeout ?? "";
          // Format is HH:MM:SS
          const parts = timeout.split(":").map(Number);
          const seconds = parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : NaN;
          if (isNaN(seconds) || seconds > MAX_SECONDS) {
            warnings.push(`Timeout "${timeout}" exceeds 3 hours (ApplicationId: ${app?.ApplicationId})`);
          }
        }
      } catch {
        warnings.push(`Could not parse policy definition for "${policy.displayName}"`);
      }
    }

    return { pass: warnings.length === 0, warnings };
  },

  "outlook-addins-blocked": (snapshot: Record<string, any>) => {
    const BLOCKED_ROLES = ["My Custom Apps", "My Marketplace Apps", "My ReadWriteMailbox Apps"];
    const policies: any[] = snapshot.data?.roleAssignmentPolicies ?? [];

    if (policies.length === 0) return { pass: false, warnings: ["No role assignment policies in snapshot"] };

    const failing: string[] = [];
    for (const policy of policies) {
      const assignedRoles: string[] = policy.assignedRoles ?? [];
      const nonCompliant = assignedRoles.filter((r: string) =>
        BLOCKED_ROLES.some(b => r.toLowerCase().replace(/\s/g, "") === b.toLowerCase().replace(/\s/g, ""))
      );
      if (nonCompliant.length > 0) {
        failing.push(`Policy "${policy.identity ?? policy.name}" has add-in roles: ${nonCompliant.join(", ")}`);
      }
    }

    return { pass: failing.length === 0, warnings: failing };
  },

  "teams-security-reporting-enabled": (snapshot: Record<string, any>) => {
    const messaging = snapshot.data?.teamsMessagingPolicy?.[0];
    const policies: any[] = snapshot.data?.threatSubmissionPolicy ?? [];
    const reportPolicy = policies[0];
    const warnings: string[] = [];

    // Part 1: Teams messaging policy — AllowSecurityEndUserReporting must be true
    if (!messaging) {
      warnings.push("teamsMessagingPolicy: data not available");
    } else if (messaging.allowSecurityEndUserReporting !== true) {
      warnings.push(`teamsMessagingPolicy: allowSecurityEndUserReporting is ${messaging.allowSecurityEndUserReporting}, expected true`);
    }

    // Part 2: Defender threat submission policy (Graph /security/threatSubmission/emailThreatSubmissionPolicies)
    if (!reportPolicy) {
      warnings.push("threatSubmissionPolicy: policy not configured — reported messages go to Microsoft only, not org mailbox");
    } else {
      // Org mailbox must be configured
      if (reportPolicy.isReportToCustomizedEmailAddressEnabled !== true) {
        warnings.push(`threatSubmissionPolicy: isReportToCustomizedEmailAddressEnabled is ${reportPolicy.isReportToCustomizedEmailAddressEnabled}, expected true`);
      }
      // Recipient address must be set
      if (!reportPolicy.customizedReportRecipientEmailAddress) {
        warnings.push("threatSubmissionPolicy: customizedReportRecipientEmailAddress is empty — no org mailbox configured");
      }
    }

    return { pass: warnings.length === 0, warnings };
  },

  "teams-unmanaged-inbound-disabled": (snapshot: Record<string, any>) => {
    const policy = snapshot.data?.teamsExternalAccessPolicy?.[0];
    const federation = snapshot.data?.teamsFederationConfiguration?.[0];

    if (!policy && !federation) {
      return { pass: false, warnings: ["Teams connector data not available"] };
    }

    // Org setting takes precedence
    if (federation && federation.allowTeamsConsumerInbound === false) {
      return { pass: true, warnings: [] };
    }

    // Policy level check
    if (policy && policy.enableTeamsConsumerInbound === false) {
      return { pass: true, warnings: [] };
    }

    const warnings = [];
    if (federation?.allowTeamsConsumerInbound !== false) {
      warnings.push(`teamsFederationConfiguration: allowTeamsConsumerInbound is ${federation?.allowTeamsConsumerInbound}`);
    }
    if (policy?.enableTeamsConsumerInbound !== false) {
      warnings.push(`teamsExternalAccessPolicy: enableTeamsConsumerInbound is ${policy?.enableTeamsConsumerInbound}`);
    }

    return { pass: false, warnings };
  },

  "teams-unmanaged-access-disabled": (snapshot: Record<string, any>) => {
    const policy = snapshot.data?.teamsExternalAccessPolicy?.[0];
    const federation = snapshot.data?.teamsFederationConfiguration?.[0];

    if (!policy && !federation) {
      return { pass: false, warnings: ["Teams connector data not available"] };
    }

    // Org setting takes precedence — passes if AllowTeamsConsumer is false
    if (federation && federation.allowTeamsConsumer === false) {
      return { pass: true, warnings: [] };
    }

    // Policy level check
    if (policy && policy.enableTeamsConsumerAccess === false) {
      return { pass: true, warnings: [] };
    }

    const warnings = [];
    if (federation?.allowTeamsConsumer !== false) {
      warnings.push(`teamsFederationConfiguration: allowTeamsConsumer is ${federation?.allowTeamsConsumer}`);
    }
    if (policy?.enableTeamsConsumerAccess !== false) {
      warnings.push(`teamsExternalAccessPolicy: enableTeamsConsumerAccess is ${policy?.enableTeamsConsumerAccess}`);
    }

    return { pass: false, warnings };
  },

  "teams-external-access-restricted": (snapshot: Record<string, any>) => {
    const policy = snapshot.data?.teamsExternalAccessPolicy?.[0];
    const federation = snapshot.data?.teamsFederationConfiguration?.[0];

    if (!policy && !federation) {
      return { pass: false, warnings: ["Teams connector data not available"] };
    }

    // PASS condition 1: org-level federation is disabled
    if (federation && federation.allowFederatedUsers === false) {
      return { pass: true, warnings: [] };
    }

    // PASS condition 2: org-level uses allowlist (not AllowAllKnownDomains)
    if (federation && federation.allowFederatedUsers === true) {
      const allowedDomains = federation.allowedDomains;
      // AllowAllKnownDomains is the permissive default — fails
      const isAllowAll = !allowedDomains ||
        (typeof allowedDomains === "object" && !Array.isArray(allowedDomains) && Object.keys(allowedDomains).length === 0) ||
        JSON.stringify(allowedDomains).includes("AllowAllKnownDomains");

      if (!isAllowAll) {
        return { pass: true, warnings: [] };
      }
    }

    // PASS condition 3: global policy disables federation access
    if (policy && policy.enableFederationAccess === false) {
      return { pass: true, warnings: [] };
    }

    const warnings = [];
    if (federation?.allowFederatedUsers !== false) {
      warnings.push(`teamsFederationConfiguration: allowFederatedUsers is ${federation?.allowFederatedUsers} with AllowAllKnownDomains`);
    }
    if (policy?.enableFederationAccess !== false) {
      warnings.push(`teamsExternalAccessPolicy: enableFederationAccess is ${policy?.enableFederationAccess}`);
    }

    return { pass: false, warnings };
  },

  "no-domain-whitelisting-transport-rules": (snapshot: Record<string, any>) => {
    const rules: any[] = snapshot.data?.transportRules ?? [];

    const whitelisted = rules.filter((r: any) =>
      r.setScl === -1 && Array.isArray(r.senderDomainIs) && r.senderDomainIs.length > 0
    );

    return {
      pass: whitelisted.length === 0,
      warnings: whitelisted.map((r: any) =>
        `Transport rule "${r.name}" whitelists domains with SCL=-1: ${r.senderDomainIs.join(", ")}`
      ),
    };
  },

  "no-external-forwarding-transport-rules": (snapshot: Record<string, any>) => {
    const rules: any[] = snapshot.data?.transportRules ?? [];

    // Find rules that redirect to external addresses
    const externalForwards = rules.filter((r: any) => {
      const redirectTo: string[] = r.redirectMessageTo ?? [];
      return redirectTo.length > 0;
    });

    if (externalForwards.length === 0) return { pass: true, warnings: [] };

    return {
      pass: false,
      warnings: externalForwards.map((r: any) =>
        `Transport rule "${r.name}" redirects to: ${r.redirectMessageTo?.join(", ")}`
      ),
    };
  },

  "pra-requires-approval": (snapshot: Record<string, any>) => {
    const rules: any[] = snapshot.data?.praRoleManagementPolicyRules ?? [];
    if (rules.length === 0) return { pass: false, warnings: ["No PRA policy rules in snapshot — re-run Watchtower"] };

    const approvalRule = rules.find((r: any) =>
      r["@odata.type"]?.toLowerCase().includes("approvalrule")
    );

    if (!approvalRule) return { pass: false, warnings: ["No approval rule found in Privileged Role Administrator policy"] };

    const isEnabled = approvalRule.setting?.isApprovalRequired === true;
    const approvers: any[] = approvalRule.setting?.approvalStages?.[0]?.primaryApprovers ?? [];
    const hasEnoughApprovers = approvers.length >= 2;

    const failing: string[] = [];
    if (!isEnabled) failing.push("Require approval to activate is not enabled for Privileged Role Administrator");
    if (!hasEnoughApprovers) failing.push(`Only ${approvers.length} approver(s) configured — minimum 2 required`);

    return { pass: failing.length === 0, warnings: failing };
  },

  "privileged-role-access-reviews-configured": (snapshot: Record<string, any>) => {
    const reviews: any[] = snapshot.data?.accessReviews ?? [];
    if (reviews.length === 0) return { pass: false, warnings: ["No access reviews found"] };

    // Required privileged roles — at minimum these must be covered
    const requiredRoles = new Set([
      "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
      "29232cdf-9323-42fd-ade2-1d097af3e4de", // Exchange Administrator
      "f28a1f50-f6e7-4571-818b-6a12f2af6b6c", // SharePoint Administrator
      "69091246-20e8-4a56-aa4d-066075b2a7a8", // Teams Administrator
      "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
    ]);

    // Find reviews that target directory roles
    const roleReviews = reviews.filter((r: any) => {
      const scope = r.scope?.["@odata.type"] ?? "";
      return scope.includes("principalResourceMembership") || r.scope?.resourceScopes?.some((s: any) =>
        s.resource?.["@odata.type"]?.includes("role")
      );
    });

    if (roleReviews.length === 0) return { pass: false, warnings: ["No access reviews targeting directory roles found"] };

    const passing = roleReviews.find((r: any) => {
      const s = r.settings ?? {};
      const recurrenceType = s.recurrence?.pattern?.type ?? "";
      const frequencyOk = recurrenceType === "absoluteMonthly" || recurrenceType === "weekly";
      const durationOk = (s.recurrence?.range?.numberOfOccurrences ?? 999) <= 14 ||
                         s.instanceDurationInDays <= 14;
      return (
        r.status === "InProgress" &&
        s.mailNotificationsEnabled === true &&
        s.reminderNotificationsEnabled === true &&
        s.justificationRequiredOnApproval === true &&
        frequencyOk &&
        s.autoApplyDecisionsEnabled === true
      );
    });

    return {
      pass: !!passing,
      warnings: passing ? [] : [
        `${roleReviews.length} role access review(s) found but none meet all CIS requirements`,
        "Required: status=InProgress, monthly/weekly, autoApply=true, notifications+justification enabled",
      ],
    };
  },

  "guest-access-reviews-configured": (snapshot: Record<string, any>) => {
    const reviews: any[] = snapshot.data?.accessReviews ?? [];
    if (reviews.length === 0) return { pass: false, warnings: ["No access reviews found — configure a guest user access review"] };

    const guestReviews = reviews.filter((r: any) => {
      const scopeQuery = r.scope?.query ?? "";
      const principalQuery = (r.scope?.principalScopes ?? []).map((s: any) => s.query).join(" ");
      return scopeQuery.toLowerCase().includes("usertype eq 'guest'") ||
             principalQuery.toLowerCase().includes("usertype eq 'guest'");
    });

    if (guestReviews.length === 0) return { pass: false, warnings: ["No access reviews targeting guest users found"] };

    const passing = guestReviews.find((r: any) => {
      const s = r.settings ?? {};
      const recurrenceType = s.recurrence?.pattern?.type ?? "";
      const frequencyOk = recurrenceType === "absoluteMonthly" || recurrenceType === "weekly";
      return (
        r.status === "InProgress" &&
        s.mailNotificationsEnabled === true &&
        s.reminderNotificationsEnabled === true &&
        s.justificationRequiredOnApproval === true &&
        frequencyOk &&
        s.autoApplyDecisionsEnabled === true &&
        s.defaultDecision === "Deny"
      );
    });

    return {
      pass: !!passing,
      warnings: passing ? [] : [
        `${guestReviews.length} guest access review(s) found but none meet all CIS requirements`,
        "Required: status=InProgress, monthly/weekly, autoApply=true, defaultDecision=Deny, notifications+justification enabled",
      ],
    };
  },

  "pim-used-for-privileged-roles": (snapshot: Record<string, any>) => {
    const sensitiveRoles = new Set(['9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3', 'c4e39bd9-1100-46d3-8c65-fb160da0071f', 'b0f54661-2d74-4c50-afa3-1ec803f12efe', '158c047a-c907-4556-b7ef-446551a6b5f7', '7698a772-787b-4ac8-901f-60d6b08affd2', '17315797-102d-40b4-93e0-432062caca18', '29232cdf-9323-42fd-ade2-1d097af3e4de', '62e90394-69f5-4237-9190-012177145e10', '729827e3-9c14-49f7-bb1b-9608f156bbb8', '3a2c62db-5318-420d-8d74-23affee5d9d5', '966707d0-3269-4727-9be2-8c3a10f19b9d', '7be44c8a-adaf-4e2a-84d6-ab2649e08a13', 'e8611ab8-c189-46e8-94e1-60213ab1f814', '194ae4cb-b126-40b2-bd5b-6091b380977d', 'f28a1f50-f6e7-4571-818b-6a12f2af6b6c', '69091246-20e8-4a56-aa4d-066075b2a7a8', 'fe930be7-5e62-47db-91af-98c3a49a38b1']);

    // Permanent assignments = privilegedUsers with roleTemplateId in sensitive roles
    const permanent: any[] = (snapshot.data?.privilegedUsers ?? [])
      .filter((a: any) => sensitiveRoles.has(a.roleTemplateId) && a.principal?.userPrincipalName);

    // Eligible assignments via PIM
    const eligible: any[] = (snapshot.data?.pimEligibleAssignments ?? [])
      .filter((a: any) => sensitiveRoles.has(a.roleDefinitionId));

    if (permanent.length === 0 && eligible.length === 0) {
      return { pass: false, warnings: ["No role assignments found — check snapshot data"] };
    }

    // Find principals with permanent assignments to sensitive roles that have no eligible assignment
    const eligiblePrincipals = new Set(eligible.map((a: any) => a.principalId));
    const permanentOnly = permanent.filter((a: any) => !eligiblePrincipals.has(a.principalId));

    if (permanentOnly.length === 0) {
      return { pass: true, warnings: [] };
    }

    return {
      pass: false,
      warnings: permanentOnly.map((a: any) =>
        `${a.principal?.userPrincipalName ?? a.principalId} has permanent assignment to role ${a.roleTemplateId} — should be eligible (JIT) only`
      ),
    };
  },

  "email-otp-disabled": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.authMethodConfigurations ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No authentication method configurations in snapshot"] };

    const configs: any[] = policies[0]?.authenticationMethodConfigurations ?? [];
    const email = configs.find((c: any) => c.id?.toLowerCase() === "email");
    if (!email) return { pass: true, warnings: [] }; // not present = not enabled = pass

    const pass = email.state === "disabled";
    return {
      pass,
      warnings: pass ? [] : [`Email OTP authentication method is ${email.state ?? "enabled"} — must be disabled`],
    };
  },

  "system-preferred-mfa-enabled": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.authMethodConfigurations ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No authentication method configurations in snapshot"] };

    const prefs = policies[0]?.systemCredentialPreferences;
    if (!prefs) return { pass: false, warnings: ["systemCredentialPreferences not found — re-run Watchtower with beta API"] };

    const state = prefs.state;
    const targets: any[] = prefs.includeTargets ?? [];
    const allUsers = targets.some((t: any) => t.id === "all_users" || t.id === "AllUsers");

    const failing: string[] = [];
    if (state !== "enabled") failing.push(`System-preferred MFA state is "${state}" (must be enabled)`);
    if (!allUsers) failing.push(`System-preferred MFA does not target all users`);

    return { pass: failing.length === 0, warnings: failing };
  },

  "weak-auth-methods-disabled": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.authMethodConfigurations ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No authentication method configurations in snapshot"] };

    const configs: any[] = policies[0]?.authenticationMethodConfigurations ?? [];
    const weakMethods = ["Sms", "Voice"];
    const failing: string[] = [];

    for (const method of weakMethods) {
      const config = configs.find((c: any) => c.id?.toLowerCase() === method.toLowerCase());
      if (!config) continue; // not present = not enabled = pass
      if (config.state !== "disabled") {
        failing.push(`${method} authentication method is ${config.state ?? "enabled"} — must be disabled`);
      }
    }

    return { pass: failing.length === 0, warnings: failing };
  },

  "onprem-password-protection-enabled": (snapshot: Record<string, any>) => {
    const allSettings: any[] = snapshot.data?.passwordProtectionSettings ?? [];
    const setting = allSettings.find((s: any) => s.templateId === "5cf42378-d67d-4f36-ba46-e8b86229381d");
    if (!setting) return { pass: false, warnings: ["No password protection settings found"] };

    const values: { name: string; value: string }[] = setting.values ?? [];
    const get = (name: string) => values.find(v => v.name === name)?.value;

    const enabled = get("EnableBannedPasswordCheckOnPremises");
    const mode = get("BannedPasswordCheckOnPremisesMode");

    const failing: string[] = [];
    if (enabled !== "True") failing.push(`EnableBannedPasswordCheckOnPremises is ${enabled ?? "not set"} (must be True)`);
    if (mode !== "Enforce") failing.push(`BannedPasswordCheckOnPremisesMode is ${mode ?? "not set"} (must be Enforce)`);

    return { pass: failing.length === 0, warnings: failing };
  },

  "custom-banned-passwords-enabled": (snapshot: Record<string, any>) => {
    const allSettings: any[] = snapshot.data?.passwordProtectionSettings ?? [];
    const setting = allSettings.find((s: any) => s.templateId === "5cf42378-d67d-4f36-ba46-e8b86229381d");
    if (!setting) return { pass: false, warnings: ["No password protection settings found — custom banned password list may not be configured"] };

    const values: { name: string; value: string }[] = setting.values ?? [];
    const get = (name: string) => values.find(v => v.name === name)?.value;

    const enforced = get("EnableBannedPasswordCheck");
    const list = get("BannedPasswordList") ?? "";

    const failing: string[] = [];
    if (enforced !== "True") failing.push(`EnableBannedPasswordCheck is ${enforced ?? "not set"} (must be True)`);
    if (!list.trim()) failing.push("BannedPasswordList is empty — add organization-specific terms");

    return { pass: failing.length === 0, warnings: failing };
  },

  "authenticator-fatigue-protection": (snapshot: Record<string, any>) => {
    const configs: any[] = snapshot.data?.authMethodsPolicy ?? [];
    if (configs.length === 0) return { pass: false, warnings: ["No Microsoft Authenticator configuration in snapshot"] };

    const config = configs[0];
    if (config.state !== "enabled") return { pass: false, warnings: [`Microsoft Authenticator is not enabled (state: ${config.state})`] };

    const features = config.featureSettings ?? {};
    const failing: string[] = [];

    const numberMatch = features.numberMatchingRequiredState?.state;
    if (numberMatch !== "enabled") failing.push(`Require number matching is ${numberMatch ?? "not set"} (must be enabled)`);

    const appName = features.displayAppInformationRequiredState?.state;
    if (appName !== "enabled") failing.push(`Show application name is ${appName ?? "not set"} (must be enabled)`);

    const geoLocation = features.displayLocationInformationRequiredState?.state;
    if (geoLocation !== "enabled") failing.push(`Show geographic location is ${geoLocation ?? "not set"} (must be enabled)`);

    return { pass: failing.length === 0, warnings: failing };
  },

  "b2b-allowed-domains-only": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.b2bManagementPolicy ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No B2B management policy in snapshot"] };

    const b2bPolicy = policies.find((p: any) => p.type === "B2BManagementPolicy");
    if (!b2bPolicy) return { pass: false, warnings: ["No B2BManagementPolicy found"] };

    try {
      const def = JSON.parse(b2bPolicy.definition?.[0] ?? "{}");
      const domainsPolicy = def?.B2BManagementPolicy?.InvitationsAllowedAndBlockedDomainsPolicy;

      if (!domainsPolicy) return { pass: false, warnings: ["No domain restriction policy defined — all domains are allowed"] };
      if (domainsPolicy.BlockedDomains !== undefined) return { pass: false, warnings: ["BlockedDomains is set — must use AllowedDomains (most restrictive) instead"] };
      if (domainsPolicy.AllowedDomains === undefined) return { pass: false, warnings: ["No AllowedDomains defined — all domains are allowed"] };

      return { pass: true, warnings: [] };
    } catch {
      return { pass: false, warnings: ["Failed to parse B2B policy definition"] };
    }
  },

  "user-consent-disabled": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.authorizationPolicy ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No authorization policy in snapshot"] };

    const assigned: string[] = policies[0].defaultUserRolePermissions?.permissionGrantPoliciesAssigned ?? [];
    const disallowed = [
      "ManagePermissionGrantsForSelf.microsoft-user-default-low",
      "ManagePermissionGrantsForSelf.microsoft-user-default-legacy",
    ];

    const found = assigned.filter(p => disallowed.some(d => p.toLowerCase().includes(d.toLowerCase())));
    const pass = found.length === 0;

    return {
      pass,
      warnings: pass ? [] : [`User consent is enabled via: ${found.join(", ")}`],
    };
  },

  "local-admin-assignment-restricted": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.deviceRegistrationPolicy ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No device registration policy in snapshot"] };

    const odataType = policies[0].azureADJoin?.localAdmins?.registeringUsers?.["@odata.type"] ?? "";
    const pass =
      odataType === "#microsoft.graph.enumeratedDeviceRegistrationMembership" ||
      odataType === "#microsoft.graph.noDeviceRegistrationMembership";

    return {
      pass,
      warnings: pass ? [] : [`azureADJoin.localAdmins.registeringUsers type is "${odataType}" — all registering users get local admin (must be Selected or None)`],
    };
  },

  "entra-join-restricted": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.deviceRegistrationPolicy ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No device registration policy in snapshot"] };

    const policy = policies[0];
    const odataType = policy.azureADJoin?.allowedToJoin?.["@odata.type"] ?? "";

    // Pass if Selected (specific users/groups) or None (nobody)
    const pass =
      odataType === "#microsoft.graph.enumeratedDeviceRegistrationMembership" ||
      odataType === "#microsoft.graph.noDeviceRegistrationMembership";

    return {
      pass,
      warnings: pass ? [] : [`azureADJoin.allowedToJoin type is "${odataType}" — all users can join devices to Entra (must be Selected or None)`],
    };
  },

  "dynamic-guest-group-exists": (snapshot: Record<string, any>) => {
    const groups: any[] = snapshot.data?.groups ?? [];

    const guestGroup = groups.find((g: any) =>
      Array.isArray(g.groupTypes) &&
      g.groupTypes.includes("DynamicMembership") &&
      g.membershipRule?.toLowerCase().includes('user.usertype -eq "guest"') &&
      g.membershipRuleProcessingState === "On"
    );

    return {
      pass: !!guestGroup,
      warnings: guestGroup ? [] : ['No dynamic group found with rule (user.userType -eq "Guest") and processing state On'],
    };
  },

  "users-cannot-register-apps": (snapshot: Record<string, any>) => {
    const policies: any[] = snapshot.data?.authorizationPolicy ?? [];
    if (policies.length === 0) return { pass: false, warnings: ["No authorization policy in snapshot"] };

    const policy = policies[0];
    const allowed = policy.defaultUserRolePermissions?.allowedToCreateApps;
    const pass = allowed === false;

    return {
      pass,
      warnings: pass ? [] : [`defaultUserRolePermissions.allowedToCreateApps is ${JSON.stringify(allowed)} — users can register applications`],
    };
  },

  "personal-device-enrollment-blocked": (snapshot: Record<string, any>) => {
    const configs: any[] = snapshot.data?.enrollmentConfigurations ?? [];
    if (configs.length === 0) return { pass: false, warnings: ["No enrollment configurations in snapshot"] };

    const defaultConfig = configs.find((c: any) =>
      c.id?.includes("DefaultPlatformRestrictions") && c.priority === 0
    );

    if (!defaultConfig) return { pass: false, warnings: ["Default platform restriction policy not found"] };

    const platforms = [
      { key: "windowsRestriction",        label: "Windows"          },
      { key: "iosRestriction",            label: "iOS/iPadOS"       },
      { key: "androidRestriction",        label: "Android"          },
      { key: "androidForWorkRestriction", label: "Android for Work" },
      { key: "macOSRestriction",          label: "macOS"            },
    ];

    const failing: string[] = [];
    for (const { key, label } of platforms) {
      const restriction = defaultConfig[key];
      const platformBlocked = restriction?.platformBlocked === true;
      const personalBlocked = restriction?.personalDeviceEnrollmentBlocked === true;
      if (!platformBlocked && !personalBlocked) {
        failing.push(`${label} — personally owned enrollment not blocked`);
      }
    }

    return { pass: failing.length === 0, warnings: failing };
  },

  "dmarc-published": (snapshot: Record<string, any>) => {
    const domains: any[] = snapshot.data?.domainDnsRecords ?? [];
    if (domains.length === 0) return { pass: false, warnings: ["No domain DNS records — re-run Watchtower"] };

    const failing: string[] = [];
    for (const d of domains) {
      // Skip mail routing domains — only the base onmicrosoft.com needs DMARC
      if (d.domain.endsWith(".mail.onmicrosoft.com")) continue;
      const record = (d.dmarc ?? [])[0] ?? "";
      if (!record) {
        failing.push(`${d.domain} — no DMARC record found`);
        continue;
      }

      const tags: Record<string, string> = {};
      for (const part of record.split(";").map((s: string) => s.trim())) {
        const [k, v] = part.split("=").map((s: string) => s.trim());
        if (k && v) tags[k.toLowerCase()] = v.toLowerCase();
      }

      const issues: string[] = [];
      if (!["quarantine", "reject"].includes(tags["p"] ?? "")) issues.push(`p=${tags["p"] ?? "missing"} (must be quarantine or reject)`);
      // pct omitted defaults to 100 per RFC 7489 — only flag if explicitly set to less than 100
      const pct = tags["pct"] !== undefined ? parseInt(tags["pct"]) : 100;
      if (pct < 100) issues.push(`pct=${pct} (must be 100)`);
      if (!record.includes("rua=mailto:")) issues.push("rua missing");
      if (!record.includes("ruf=mailto:")) issues.push("ruf missing");

      if (issues.length > 0) failing.push(`${d.domain} — ${issues.join(", ")}`);
    }

    return { pass: failing.length === 0, warnings: failing };
  },

  "dkim-enabled": (snapshot: Record<string, any>) => {
    const domains: any[] = snapshot.data?.domainDnsRecords ?? [];
    if (domains.length === 0) return { pass: false, warnings: ["No domain DNS records — re-run Watchtower"] };

    const failing: string[] = [];
    for (const d of domains) {
      const hasDkim = (d.dkim ?? []).length > 0;
      if (!hasDkim) failing.push(`${d.domain} — no DKIM record found (selector1 or selector2._domainkey)`);
    }

    return { pass: failing.length === 0, warnings: failing };
  },

  "spf-records-published": (snapshot: Record<string, any>) => {
    const domains: any[] = snapshot.data?.domainDnsRecords ?? [];
    if (domains.length === 0) return { pass: false, warnings: ["No domain DNS records — re-run Watchtower"] };

    const failing: string[] = [];
    for (const d of domains) {
      const hasSpf = (d.spf ?? []).some((r: string) => r.includes("spf.protection.outlook.com"));
      if (!hasSpf) failing.push(`${d.domain} — missing SPF record with spf.protection.outlook.com`);
    }

    return { pass: failing.length === 0, warnings: failing };
  },

  "third-party-storage-disabled": (snapshot: Record<string, any>) => {
    const sps: any[] = snapshot.data?.thirdPartyStorage ?? [];
    // Pass if SP doesn't exist (never been enabled) or exists but is disabled
    if (sps.length === 0) return { pass: true, warnings: [] };
    const sp = sps[0];
    const pass = sp.accountEnabled === false;
    return {
      pass,
      warnings: pass ? [] : [`Service principal "${sp.displayName}" (${sp.appId}) is enabled — third-party storage is allowed`],
    };
  },

};

// ─── Runner ───────────────────────────────────────────────────────────────────

function runSpec(spec: PolicySpec, policies: any[], config: ArgusConfig, snapshot?: Record<string, any>): V1ControlResult {
  const base: Omit<V1ControlResult, "pass" | "warnings"> = {
    id: spec.id,
    framework: spec.framework,
    frameworkVersion: spec.frameworkVersion,
    product: spec.product,
    title: spec.title,
  };

  // Custom evaluator mode
  if (spec.custom) {
    const evaluator = CUSTOM_EVALUATORS[spec.custom];
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
  evaluatorSlug?: string;  // name in CUSTOM_EVALUATORS map

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
  // Support bracket notation for keys with dots (e.g. ["@odata.type"])
  const segments: string[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === "[" && path[i + 1] === '"') {
      // Bracket-escaped segment: ["key.with.dots"]
      const end = path.indexOf('"]', i + 2);
      if (end === -1) break;
      segments.push(path.slice(i + 2, end));
      i = end + 2;
      if (path[i] === ".") i++; // skip trailing dot separator
    } else {
      // Normal dot-separated segment
      const dot = path.indexOf(".", i);
      const bracket = path.indexOf("[", i);
      let end: number;
      if (dot === -1 && bracket === -1) end = path.length;
      else if (dot === -1) end = bracket;
      else if (bracket === -1) end = dot;
      else end = Math.min(dot, bracket);
      segments.push(path.slice(i, end));
      i = end;
      if (path[i] === ".") i++; // skip dot separator
    }
  }
  return segments.reduce((o, k) => o?.[k], obj);
}


// ─── CA Policy Specs ──────────────────────────────────────────────────────────
// Match specs for CA policy controls. Keyed by control ID.
// These are the same specs as the v1 spec files, inlined here so v2 doesn't
// need to load spec files at runtime.

const ADMIN_ROLES = ['9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3', 'c4e39bd9-1100-46d3-8c65-fb160da0071f', 'b0f54661-2d74-4c50-afa3-1ec803f12efe', '158c047a-c907-4556-b7ef-446551a6b5f7', 'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9', '29232cdf-9323-42fd-ade2-1d097af3e4de', '62e90394-69f5-4237-9190-012177145e10', 'f2ef992c-3afb-46b9-b7cf-a126ee74c451', '729827e3-9c14-49f7-bb1b-9608f156bbb8', '966707d0-3269-4727-9be2-8c3a10f19b9d', '7be44c8a-adaf-4e2a-84d6-ab2649e08a13', 'e8611ab8-c189-46e8-94e1-60213ab1f814', '194ae4cb-b126-40b2-bd5b-6091b380977d', 'f28a1f50-f6e7-4571-818b-6a12f2af6b6c', 'fe930be7-5e62-47db-91af-98c3a49a38b1'];

const CA_POLICY_SPECS: Record<string, PolicySpec> = {
  "1.3.2b": { id: "1.3.2", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Idle session timeout ≤ 3 hours (CA policy)", match: { users: { include: "All" }, apps: { include: "Office365" }, clientAppTypes: ["browser"], session: { appEnforcedRestrictions: true }, state: "active" } } as any,
  "5.2.2.1": { id: "5.2.2.1", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "MFA required for admin roles", match: { users: { roles: ADMIN_ROLES }, apps: { include: "All", noExclusions: true }, grant: { anyOf: ["mfa"] }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.2": { id: "5.2.2.2", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "MFA required for all users", match: { users: { include: "All" }, apps: { include: "All", noExclusions: true }, grant: { anyOf: ["mfa"] }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.3": { id: "5.2.2.3", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "CA policies block legacy authentication", match: { users: { include: "All" }, apps: { include: "All" }, clientAppTypes: ["exchangeActiveSync", "other"], grant: { anyOf: ["block"] }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.4": { id: "5.2.2.4", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Sign-in frequency for admins", match: { users: { roles: ADMIN_ROLES }, apps: { include: "All" }, session: { signInFrequencyHours: 4, persistentBrowser: false }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.5": { id: "5.2.2.5", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Phishing-resistant MFA for admins", match: { users: { roles: ADMIN_ROLES }, apps: { include: "All", noExclusions: true }, grant: { authStrength: "00000000-0000-0000-0000-000000000004" }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.6": { id: "5.2.2.6", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Identity Protection user risk policies", match: { users: { include: "All" }, apps: { include: "All" }, userRisk: ["high"], grant: { anyOf: ["mfa", "passwordChange"] }, session: { signInFrequencyHours: 0 }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.7": { id: "5.2.2.7", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Identity Protection sign-in risk policies", match: { users: { include: "All" }, apps: { include: "All" }, signInRisk: ["high", "medium"], grant: { anyOf: ["mfa"] }, session: { signInFrequencyHours: 0 }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.8": { id: "5.2.2.8", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Sign-in risk blocked for medium/high", match: { users: { include: "All" }, apps: { include: "All", noExclusions: true }, signInRisk: ["high", "medium"], grant: { anyOf: ["block"] }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.9": { id: "5.2.2.9", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Managed device required", match: { users: { include: "All" }, apps: { include: "All" }, grant: { anyOf: ["compliantDevice", "domainJoinedDevice"], operator: "OR" }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.10": { id: "5.2.2.10", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Managed device required to register security info", match: { users: { include: "All" }, userActions: ["urn:user:registerSecurityInfo"], grant: { anyOf: ["compliantDevice", "domainJoinedDevice"], operator: "OR" }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.11": { id: "5.2.2.11", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Sign-in frequency for Intune Enrollment", match: { users: { include: "All" }, apps: { include: "d4ebce55-015a-49b5-a083-c84d1797ae8c" }, grant: { anyOf: ["mfa"] }, session: { signInFrequencyHours: 0 }, exclusions: "break-glass-only", state: "active" } } as any,
  "5.2.2.12": { id: "5.2.2.12", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365", title: "Device code sign-in flow is blocked", match: { users: { include: "All" }, apps: { include: "All" }, authenticationFlows: ["deviceCodeFlow"], grant: { anyOf: ["block"] }, exclusions: "break-glass-only", state: "active" } } as any,
};

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

    // Custom named evaluators — route through runAudit
    const pseudoSpec = {
      id:               assertion.controlId,
      framework:        assertion.frameworkSlug,
      frameworkVersion: "",
      product:          "M365",
      title:            assertion.controlTitle,
      custom:           assertion.evaluatorSlug,
    } as unknown as PolicySpec;
    const auditResults = runAudit([pseudoSpec], snapshot, config);
    const result = auditResults[0];
    if (!result) return { ...base, pass: false, actualValues: {}, failures: [`evaluator ${assertion.evaluatorSlug} returned no result`] };
    return {
      ...base,
      pass:         result.pass,
      actualValues: {},
      failures:     result.warnings,
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
        // Not found can be a pass (e.g. email OTP method not present = disabled = pass)
        // If expectedValue is "disabled" or false, not finding the item is a pass
        actualValues[`${arrayPath}[${JSON.stringify(findBy)}]`] = null;
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
    const filter = assertion.sourceFilter as Record<string, any> | undefined;
    const filtered = filter
      ? sourceData.filter(item =>
          Object.entries(filter).every(([k, v]) => getProperty(item, k) === v)
        )
      : sourceData;
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
    const avFilter = assertion.sourceFilter as Record<string, any> | undefined;
    const sourceData = avFilter
      ? rawData.filter(item =>
          Object.entries(avFilter).every(([k, v]) => {
            const itemVal = getProperty(item, k);
            if (Array.isArray(itemVal)) return itemVal.includes(v);
            return itemVal === v;
          })
        )
      : rawData;
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
  // Apply sourceFilter before evaluation (same logic as count operator)
  const filter = assertion.sourceFilter as Record<string, any> | undefined;
  const sourceData = filter
    ? rawSourceData.filter(item =>
        Object.entries(filter).every(([k, v]) => {
          const itemVal = getProperty(item, k);
          // Support array-contains check (e.g. groupTypes includes "Unified")
          if (Array.isArray(itemVal)) return itemVal.includes(v);
          return itemVal === v;
        })
      )
    : rawSourceData;
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
      if (sub.sourceFilter) {
        subData = subData.filter(item =>
          Object.entries(sub.sourceFilter!).every(([k, v]) => {
            const itemVal = getProperty(item, k);
            if (Array.isArray(itemVal)) return itemVal.includes(v);
            return itemVal === v;
          })
        );
      }

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
