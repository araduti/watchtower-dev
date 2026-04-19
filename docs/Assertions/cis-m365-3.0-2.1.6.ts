export default {
  slug: "wt.exo.spam-admin-notification-enabled",
  id: "2.1.6",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Exchange Online Spam Policies are set to notify administrators",
  requiresConnector: "defender-exchange", // Get-HostedOutboundSpamFilterPolicy
  source: "hostedOutboundSpamFilterPolicies",
  assert: {
    property: "bccSuspiciousOutboundMail",
    value: true,
    also: [
      { property: "notifyOutboundSpam",                       value: true     },
      { property: "bccSuspiciousOutboundAdditionalRecipients", notEmpty: true },
      { property: "notifyOutboundSpamRecipients",              notEmpty: true },
    ],
  },
};
