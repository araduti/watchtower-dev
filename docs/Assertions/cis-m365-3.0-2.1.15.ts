export default {
  id: "2.1.15",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Outbound anti-spam message limits are in place",
  requiresConnector: "defender-exchange", // Get-HostedOutboundSpamFilterPolicy -Identity Default
  source: "hostedOutboundSpamFilterPolicies",
  assert: {
    filter: { identity: "Default" },
    property: "actionWhenThresholdReached",
    value: "BlockUser",
    also: [
      { property: "recipientLimitExternalPerHour", max: 500  },
      { property: "recipientLimitInternalPerHour", max: 1000 },
      { property: "recipientLimitPerDay",          max: 1000 },
      { property: "notifyOutboundSpamRecipients",  notEmpty: true },
    ],
  },
};
