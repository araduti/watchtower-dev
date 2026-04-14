import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const allSettings: any[] = snapshot.data?.passwordProtectionSettings ?? [];
  const setting = allSettings.find((s: any) => s.templateId === "5cf42378-d67d-4f36-ba46-e8b86229381d");
  if (!setting) return { pass: false, warnings: ["No password protection settings found — custom banned password list may not be configured"] };

  const values: { name: string; value: string }[] = setting.values ?? [];
  const get = (name: string) => values.find(v => v.name === name)?.value;

  const enforced = get("EnableBannedPasswordCheck");
  const list = get("BannedPasswordList") ?? "";

  const failing: string[] = [];
  if (enforced !== "True") failing.push(`EnableBannedPasswordCheck is ${enforced ?? "not set"} (must be True)`);
  if (!list.trim()) failing.push("BannedPasswordList is empty — add organization-specific terms");

  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "custom-banned-passwords-enabled",
  evaluate,
} satisfies EvaluatorModule;
