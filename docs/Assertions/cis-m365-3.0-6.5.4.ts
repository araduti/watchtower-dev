export default {
  id: "6.5.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "SMTP AUTH is disabled",
  requiresConnector: "exchange-online", // Get-TransportConfig | fl SmtpClientAuthenticationDisabled
  source: "transportConfig",
  assert: {
    property: "smtpClientAuthenticationDisabled",
    value: true,
  },
};
