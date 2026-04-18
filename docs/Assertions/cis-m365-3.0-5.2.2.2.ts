export default {
  id: "5.2.2.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Multifactor authentication is enabled for all users",
  match: {
    users: { include: "All" },
    apps: { include: "All", noExclusions: true },
    grant: { anyOf: ["mfa"] },
    exclusions: "break-glass-only",
    state: "active",
  },
};
