import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "pra-requires-approval",
  evaluate,
} satisfies EvaluatorModule;
