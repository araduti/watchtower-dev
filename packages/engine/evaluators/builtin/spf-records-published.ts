import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

// SPF records are DNS TXT strings like "v=spf1 include:spf.protection.outlook.com -all"
// Match the include directive specifically to avoid partial-string false positives
const SPF_INCLUDE = /\binclude:spf\.protection\.outlook\.com\b/;

const evaluate: EvaluatorFn = (snapshot) => {
  const domains: any[] = snapshot.data?.domainDnsRecords ?? [];
  if (domains.length === 0) return { pass: false, warnings: ["No domain DNS records — re-run Watchtower"] };

  const failing: string[] = [];
  for (const d of domains) {
    const hasSpf = (d.spf ?? []).some((r: string) => SPF_INCLUDE.test(r));
    if (!hasSpf) failing.push(`${d.domain} — missing SPF record with include:spf.protection.outlook.com`);
  }

  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "spf-records-published",
  evaluate,
} satisfies EvaluatorModule;
