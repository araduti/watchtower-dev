export default {
  id: "5.2.2.7",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Identity Protection sign-in risk policies are enabled",
  match: {
    users: { include: "All" },
    apps: { include: "All" },
    signInRisk: ["high", "medium"],
    grant: { anyOf: ["mfa"] },
    session: { signInFrequencyHours: 0 }, // Every time
    exclusions: "break-glass-only",
    state: "active",
  },
};
