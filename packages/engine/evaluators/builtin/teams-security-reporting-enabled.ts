import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "teams-security-reporting-enabled",
  evaluate,
} satisfies EvaluatorModule;
