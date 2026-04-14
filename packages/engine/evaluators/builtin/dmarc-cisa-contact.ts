import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const domains: any[] = snapshot.data?.domainDnsRecords ?? [];
  if (domains.length === 0) return { pass: false, warnings: ["No domain DNS records"] };
  const failing: string[] = [];
  for (const d of domains) {
    if (d.domain.endsWith(".mail.onmicrosoft.com")) continue;
    const record = (d.dmarc ?? [])[0] ?? "";
    if (!record.includes("mailto:reports@dmarc.cyber.dhs.gov")) {
      failing.push(`${d.domain} — DMARC rua missing reports@dmarc.cyber.dhs.gov`);
    }
  }
  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "dmarc-cisa-contact",
  evaluate,
} satisfies EvaluatorModule;
