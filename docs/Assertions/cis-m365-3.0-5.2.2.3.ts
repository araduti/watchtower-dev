export default {
  slug: "wt.entra.ca.legacy-auth-blocked",
  id: "5.2.2.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Conditional Access policies block legacy authentication",
  match: {
    users: { include: "All" },
    apps: { include: "All" },
    clientAppTypes: ["exchangeActiveSync", "other"],
    grant: { anyOf: ["block"] },
    exclusions: "break-glass-only",
    state: "active",
  },
};
