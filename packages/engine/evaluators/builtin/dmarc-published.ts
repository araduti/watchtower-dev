import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const domains: any[] = snapshot.data?.domainDnsRecords ?? [];
  if (domains.length === 0) return { pass: false, warnings: ["No domain DNS records — re-run Watchtower"] };

  const failing: string[] = [];
  for (const d of domains) {
    // Skip mail routing domains — only the base onmicrosoft.com needs DMARC
    if (d.domain.endsWith(".mail.onmicrosoft.com")) continue;
    const record = (d.dmarc ?? [])[0] ?? "";
    if (!record) {
      failing.push(`${d.domain} — no DMARC record found`);
      continue;
    }

    const tags: Record<string, string> = {};
    for (const part of record.split(";").map((s: string) => s.trim())) {
      const [k, v] = part.split("=").map((s: string) => s.trim());
      if (k && v) tags[k.toLowerCase()] = v.toLowerCase();
    }

    const issues: string[] = [];
    if (!["quarantine", "reject"].includes(tags["p"] ?? "")) issues.push(`p=${tags["p"] ?? "missing"} (must be quarantine or reject)`);
    // pct omitted defaults to 100 per RFC 7489 — only flag if explicitly set to less than 100
    const pct = tags["pct"] !== undefined ? parseInt(tags["pct"]) : 100;
    if (pct < 100) issues.push(`pct=${pct} (must be 100)`);
    if (!record.includes("rua=mailto:")) issues.push("rua missing");
    if (!record.includes("ruf=mailto:")) issues.push("ruf missing");

    if (issues.length > 0) failing.push(`${d.domain} — ${issues.join(", ")}`);
  }

  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "dmarc-published",
  evaluate,
} satisfies EvaluatorModule;
