import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "b2b-allowed-domains-only",
  evaluate,
} satisfies EvaluatorModule;
