export default {
  slug: "wt.purview.dlp-policies-enabled",
  id: "3.2.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "DLP policies are enabled",
  requiresConnector: "purview", // DLP policies not exposed in Graph — requires Purview/Compliance API
  source: "dlpPolicies",
  assert: {
    property: "mode",
    value: "Enable", // Enable = enforced, TestWithNotifications = report-only, Disable = off
    negate: false,
  },
};
