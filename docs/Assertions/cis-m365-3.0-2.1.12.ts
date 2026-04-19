export default {
  slug: "wt.defender.connection-filter-ip-allowlist-empty",
  id: "2.1.12",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Connection filter IP allow list is not used",
  requiresConnector: "defender-exchange", // Get-HostedConnectionFilterPolicy -Identity Default
  source: "hostedConnectionFilterPolicies",
  assert: {
    filter: { identity: "Default" },
    property: "iPAllowList",
    notEmpty: false, // must be empty
  },
};
