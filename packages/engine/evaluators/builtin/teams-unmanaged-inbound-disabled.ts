import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "teams-unmanaged-inbound-disabled",
  evaluate,
} satisfies EvaluatorModule;
