import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "teams-external-access-restricted",
  evaluate,
} satisfies EvaluatorModule;
