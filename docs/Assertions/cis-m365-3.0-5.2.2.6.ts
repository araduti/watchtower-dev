export default {
  slug: "wt.entra.ca.user-risk-policy-enabled",
  id: "5.2.2.6",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Identity Protection user risk policies are enabled",
  match: {
    users: { include: "All" },
    apps: { include: "All" },
    userRisk: ["high"],
    grant: { anyOf: ["mfa", "passwordChange"] },
    session: { signInFrequencyHours: 0 }, // "Every time" = 0 hours
    exclusions: "break-glass-only",
    state: "active",
  },
};
