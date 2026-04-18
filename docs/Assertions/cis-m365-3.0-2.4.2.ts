export default {
  id: "2.4.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Priority accounts have Strict protection presets applied",
  requiresConnector: "defender-exchange", // Get-ATPProtectionPolicyRule -Identity "Strict Preset Security Policy"
  source: "atpProtectionPolicyRules",
  assert: {
    filter: { identity: "Strict Preset Security Policy" },
    property: "state",
    value: "Enabled",
    also: [
      { property: "sentToMemberOf", notEmpty: true }, // priority account groups must be targeted
    ],
  },
};
