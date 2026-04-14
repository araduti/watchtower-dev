import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const reviews: any[] = snapshot.data?.accessReviews ?? [];
  if (reviews.length === 0) return { pass: false, warnings: ["No access reviews found — configure a guest user access review"] };

  const guestReviews = reviews.filter((r: any) => {
    const scopeQuery = r.scope?.query ?? "";
    const principalQuery = (r.scope?.principalScopes ?? []).map((s: any) => s.query).join(" ");
    return scopeQuery.toLowerCase().includes('usertype eq \'guest\'') ||
           principalQuery.toLowerCase().includes('usertype eq \'guest\'');
  });

  if (guestReviews.length === 0) return { pass: false, warnings: ["No access reviews targeting guest users found"] };

  const passing = guestReviews.find((r: any) => {
    const s = r.settings ?? {};
    const recurrenceType = s.recurrence?.pattern?.type ?? "";
    const frequencyOk = recurrenceType === "absoluteMonthly" || recurrenceType === "weekly";
    return (
      r.status === "InProgress" &&
      s.mailNotificationsEnabled === true &&
      s.reminderNotificationsEnabled === true &&
      s.justificationRequiredOnApproval === true &&
      frequencyOk &&
      s.autoApplyDecisionsEnabled === true &&
      s.defaultDecision === "Deny"
    );
  });

  return {
    pass: !!passing,
    warnings: passing ? [] : [
      `${guestReviews.length} guest access review(s) found but none meet all CIS requirements`,
      "Required: status=InProgress, monthly/weekly, autoApply=true, defaultDecision=Deny, notifications+justification enabled",
    ],
  };
};

export default {
  slug: "guest-access-reviews-configured",
  evaluate,
} satisfies EvaluatorModule;
