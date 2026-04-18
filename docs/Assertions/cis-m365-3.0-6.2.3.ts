export default {
  id: "6.2.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Email from external senders is identified",
  requiresConnector: "exchange-online", // Get-ExternalInOutlook
  source: "externalInOutlook",
  assert: {
    property: "enabled",
    value: true,
  },
};
