import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const domains: any[] = snapshot.data?.domainDnsRecords ?? [];
  if (domains.length === 0) return { pass: false, warnings: ["No domain DNS records"] };
  const failing: string[] = [];
  for (const d of domains) {
    if (d.domain.endsWith(".mail.onmicrosoft.com")) continue;
    const record = (d.dmarc ?? [])[0] ?? "";
    if (!record) { failing.push(`${d.domain} — no DMARC record`); continue; }
    // Match the p= tag regardless of position in the record
    const pMatch = record.match(/\bp=([^;\s]+)/i);
    if (!pMatch || pMatch[1]?.toLowerCase() !== "reject") {
      failing.push(`${d.domain} — DMARC p=${pMatch?.[1] ?? "missing"} (must be reject)`);
    }
  }
  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "dmarc-reject",
  evaluate,
} satisfies EvaluatorModule;
