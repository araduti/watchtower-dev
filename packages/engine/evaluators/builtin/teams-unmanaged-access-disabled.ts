import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "teams-unmanaged-access-disabled",
  evaluate,
} satisfies EvaluatorModule;
