import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
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
};

export default {
  slug: "onprem-password-protection-enabled",
  evaluate,
} satisfies EvaluatorModule;
