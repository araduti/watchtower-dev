export default {
  slug: "wt.defender.common-attachment-filter-enabled",
  id: "2.1.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Common Attachment Types Filter is enabled",
  requiresConnector: "defender-exchange", // Get-MalwareFilterPolicy -Identity Default
  source: "malwareFilterPolicies",
  assert: {
    property: "enableFileFilter",
    value: true,
  },
};
