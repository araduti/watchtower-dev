export default {
  slug: "wt.entra.ca.managed-device-required-for-auth",
  id: "5.2.2.9",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Managed device required for authentication",
  match: {
    users: { include: "All" },
    apps: { include: "All" },
    grant: { anyOf: ["compliantDevice", "domainJoinedDevice"], operator: "OR" },
    exclusions: "break-glass-only",
    state: "active",
  },
};
