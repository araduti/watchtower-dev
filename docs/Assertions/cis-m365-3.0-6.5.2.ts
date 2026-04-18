export default {
  id: "6.5.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "MailTips are enabled for end users",
  requiresConnector: "exchange-online", // Get-OrganizationConfig | fl MailTips*
  source: "organizationConfig",
  assert: {
    property: "mailTipsAllTipsEnabled",
    value: true,
    also: [
      { property: "mailTipsExternalRecipientsTipsEnabled", value: true },
      { property: "mailTipsGroupMetricsEnabled",           value: true },
    ],
  },
};
