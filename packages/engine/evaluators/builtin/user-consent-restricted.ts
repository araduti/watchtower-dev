import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const policies: any[] = snapshot.data?.authorizationPolicy ?? [];
  if (policies.length === 0) return { pass: false, warnings: ["No authorization policy in snapshot"] };
  const assigned: string[] = policies[0]?.permissionGrantPolicyIdsAssignedToDefaultUserRole ?? [];
  const broad = [
    "managepermissiongrantsforself.microsoft-user-default-low",
    "managepermissiongrantsforself.microsoft-user-default-legacy",
  ];
  const found = assigned.filter(p => broad.some(b => p.toLowerCase().includes(b)));
  return {
    pass: found.length === 0,
    warnings: found.length === 0 ? [] : [`User consent enabled via: ${found.join(", ")}`],
  };
};

export default {
  slug: "user-consent-restricted",
  evaluate,
} satisfies EvaluatorModule;
