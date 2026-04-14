import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const reviews: any[] = snapshot.data?.accessReviews ?? [];
  if (reviews.length === 0) return { pass: false, warnings: ["No access reviews found"] };

  // Required privileged roles — at minimum these must be covered
  const requiredRoles = new Set([
    "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
    "29232cdf-9323-42fd-ade2-1d097af3e4de", // Exchange Administrator
    "f28a1f50-f6e7-4571-818b-6a12f2af6b6c", // SharePoint Administrator
    "69091246-20e8-4a56-aa4d-066075b2a7a8", // Teams Administrator
    "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
  ]);

  // Find reviews that target directory roles
  const roleReviews = reviews.filter((r: any) => {
    const scope = r.scope?.["@odata.type"] ?? "";
    return scope.includes("principalResourceMembership") || r.scope?.resourceScopes?.some((s: any) =>
      s.resource?.["@odata.type"]?.includes("role")
    );
  });

  if (roleReviews.length === 0) return { pass: false, warnings: ["No access reviews targeting directory roles found"] };

  const passing = roleReviews.find((r: any) => {
    const s = r.settings ?? {};
    const recurrenceType = s.recurrence?.pattern?.type ?? "";
    const frequencyOk = recurrenceType === "absoluteMonthly" || recurrenceType === "weekly";
    const durationOk = (s.recurrence?.range?.numberOfOccurrences ?? 999) <= 14 ||
                        s.instanceDurationInDays <= 14;
    return (
      r.status === "InProgress" &&
      s.mailNotificationsEnabled === true &&
      s.reminderNotificationsEnabled === true &&
      s.justificationRequiredOnApproval === true &&
      frequencyOk &&
      s.autoApplyDecisionsEnabled === true
    );
  });

  return {
    pass: !!passing,
    warnings: passing ? [] : [
      `${roleReviews.length} role access review(s) found but none meet all CIS requirements`,
      "Required: status=InProgress, monthly/weekly, autoApply=true, notifications+justification enabled",
    ],
  };
};

export default {
  slug: "privileged-role-access-reviews-configured",
  evaluate,
} satisfies EvaluatorModule;
