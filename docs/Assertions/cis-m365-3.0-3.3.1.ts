export default {
  id: "3.3.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Information Protection sensitivity label policies are published",
  requiresConnector: "purview", // Get-LabelPolicy | Where-Object { $_.Type -eq "PublishedSensitivityLabel" }
  source: "labelPolicies",
  assert: {
    filter: { type: "PublishedSensitivityLabel" },
    count: { min: 1 },
  },
};
