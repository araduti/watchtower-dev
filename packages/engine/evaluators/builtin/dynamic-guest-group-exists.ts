import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const groups: any[] = snapshot.data?.groups ?? [];

  const guestGroup = groups.find((g: any) =>
    Array.isArray(g.groupTypes) &&
    g.groupTypes.includes("DynamicMembership") &&
    g.membershipRule?.toLowerCase().includes('user.usertype -eq "guest"') &&
    g.membershipRuleProcessingState === "On"
  );

  return {
    pass: !!guestGroup,
    warnings: guestGroup ? [] : ['No dynamic group found with rule (user.userType -eq "Guest") and processing state On'],
  };
};

export default {
  slug: "dynamic-guest-group-exists",
  evaluate,
} satisfies EvaluatorModule;
