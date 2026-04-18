export default {
  id: "2.4.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Zero-hour auto purge for Microsoft Teams is on",
  requiresConnector: "defender-exchange", // Get-TeamsProtectionPolicy
  source: "teamsProtectionPolicies",
  assert: {
    property: "zapEnabled",
    value: true,
  },
};
