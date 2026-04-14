import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const rules: any[] = snapshot.data?.atpProtectionPolicyRules ?? [];
  if (rules.length === 0) return { pass: false, warnings: ["No ATP protection policy rules in snapshot"] };
  const hasStandard = rules.some((r: any) => r.identity?.toLowerCase().includes("standard"));
  const hasStrict = rules.some((r: any) => r.identity?.toLowerCase().includes("strict"));
  const failing: string[] = [];
  if (!hasStandard) failing.push("Standard preset security policy not found or disabled");
  if (!hasStrict) failing.push("Strict preset security policy not found or disabled");
  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "preset-policies-enabled",
  evaluate,
} satisfies EvaluatorModule;
