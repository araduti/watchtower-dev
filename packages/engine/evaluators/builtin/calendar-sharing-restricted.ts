import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const policies: any[] = snapshot.data?.sharingPolicies ?? [];
  if (policies.length === 0) return { pass: false, warnings: ["No sharing policies in snapshot"] };
  const failing: string[] = [];
  for (const p of policies) {
    const domains: string[] = p.domains ?? [];
    for (const d of domains) {
      // Format is "domain:action" — "*" means all domains, CalendarSharing* actions share details
      if (d.startsWith("*:") && d.toLowerCase().includes("calendarsharingfreebusydetail")) {
        failing.push(`Sharing policy "${p.name ?? p.identity}" shares calendar details with all domains`);
      }
    }
  }
  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "calendar-sharing-restricted",
  evaluate,
} satisfies EvaluatorModule;
