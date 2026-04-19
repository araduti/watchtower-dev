export default {
  slug: "wt.defender.anti-spam-no-allowed-domains",
  id: "2.1.14",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Inbound anti-spam policies do not contain allowed domains",
  requiresConnector: "defender-exchange", // Get-HostedContentFilterPolicy
  source: "hostedContentFilterPolicies",
  assert: {
    property: "allowedSenderDomains",
    notEmpty: false, // every policy must have an empty allowed domains list
    negate: false,
  },
};
