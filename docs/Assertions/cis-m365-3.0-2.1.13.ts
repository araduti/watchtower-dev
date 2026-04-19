export default {
  slug: "wt.defender.connection-filter-safelist-disabled",
  id: "2.1.13",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Connection filter safe list is off",
  requiresConnector: "defender-exchange", // Get-HostedConnectionFilterPolicy -Identity Default
  source: "hostedConnectionFilterPolicies",
  assert: {
    filter: { identity: "Default" },
    property: "enableSafeList",
    value: false,
  },
};
