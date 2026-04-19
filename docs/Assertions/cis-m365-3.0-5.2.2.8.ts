export default {
  slug: "wt.entra.ca.signin-risk-blocked",
  id: "5.2.2.8",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Sign-in risk is blocked for medium and high risk",
  match: {
    users: { include: "All" },
    apps: { include: "All", noExclusions: true },
    signInRisk: ["high", "medium"],
    grant: { anyOf: ["block"] },
    exclusions: "break-glass-only",
    state: "active",
  },
};
