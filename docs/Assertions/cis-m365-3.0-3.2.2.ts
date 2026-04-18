export default {
  id: "3.2.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "DLP policies are enabled for Microsoft Teams",
  requiresConnector: "purview", // Get-DlpCompliancePolicy | Where-Object {$_.Workload -match "Teams"}
  source: "dlpPolicies",
  assert: {
    filter: { workload: "Teams" },
    property: "mode",
    value: "Enable",
    also: [
      { property: "teamsLocation", notEmpty: true },
    ],
  },
};
