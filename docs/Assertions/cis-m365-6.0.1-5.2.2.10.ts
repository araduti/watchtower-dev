export default {
  slug: "wt.entra.ca.managed-device-required-for-security-info",
  id: "5.2.2.10",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Managed device required to register security information",
  match: {
    users: { include: "All" },
    userActions: ["urn:user:registerSecurityInfo"],
    grant: { anyOf: ["compliantDevice", "domainJoinedDevice"], operator: "OR" },
    exclusions: "break-glass-only",
    state: "active",
  },
};
