import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const rules: any[] = snapshot.data?.transportRules ?? [];

  // Find rules that redirect to external addresses
  const externalForwards = rules.filter((r: any) => {
    const redirectTo: string[] = r.redirectMessageTo ?? [];
    return redirectTo.length > 0;
  });

  if (externalForwards.length === 0) return { pass: true, warnings: [] };

  return {
    pass: false,
    warnings: externalForwards.map((r: any) =>
      `Transport rule "${r.name}" redirects to: ${r.redirectMessageTo?.join(", ")}`
    ),
  };
};

export default {
  slug: "no-external-forwarding-transport-rules",
  evaluate,
} satisfies EvaluatorModule;
