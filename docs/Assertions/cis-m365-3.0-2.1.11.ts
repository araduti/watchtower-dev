export default {
  slug: "wt.defender.comprehensive-attachment-filtering",
  id: "2.1.11",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Comprehensive attachment filtering is applied",
  requiresConnector: "defender-exchange", // Get-MalwareFilterPolicy + Get-MalwareFilterRule
  source: "malwareFilterPolicies",
  // Pass condition: at least one active policy with EnableFileFilter=true
  // and at least 90% of the 184 CIS reference extensions (>=166 extensions, min 120 to qualify)
  assert: {
    property: "enableFileFilter",
    value: true,
    also: [
      { property: "fileTypeCount", min: 166 }, // 90% of 184
    ],
  },
};
