import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const rules: any[] = snapshot.data?.transportRules ?? [];

  const whitelisted = rules.filter((r: any) =>
    r.setScl === -1 && Array.isArray(r.senderDomainIs) && r.senderDomainIs.length > 0
  );

  return {
    pass: whitelisted.length === 0,
    warnings: whitelisted.map((r: any) =>
      `Transport rule "${r.name}" whitelists domains with SCL=-1: ${r.senderDomainIs.join(", ")}`
    ),
  };
};

export default {
  slug: "no-domain-whitelisting-transport-rules",
  evaluate,
} satisfies EvaluatorModule;
