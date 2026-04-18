export default {
  id: "6.5.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Modern authentication for Exchange Online is enabled",
  requiresConnector: "exchange-online", // Get-OrganizationConfig | fl OAuth2ClientProfileEnabled
  source: "organizationConfig",
  assert: {
    property: "oAuth2ClientProfileEnabled",
    value: true,
  },
};
