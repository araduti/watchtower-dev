export default {
  id: "5.2.2.12",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Device code sign-in flow is blocked",
  match: {
    users: { include: "All" },
    apps: { include: "All" },
    authenticationFlows: ["deviceCodeFlow"],
    grant: { anyOf: ["block"] },
    exclusions: "break-glass-only",
    state: "active",
  },
};
