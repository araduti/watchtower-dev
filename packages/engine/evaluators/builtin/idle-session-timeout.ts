import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "idle-session-timeout",
  evaluate,
} satisfies EvaluatorModule;
