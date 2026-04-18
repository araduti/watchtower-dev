export default {
  id: "1.3.6",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Customer lockbox feature is enabled",
  requiresConnector: "exchange-online", // Get-OrganizationConfig -CustomerLockBoxEnabled
  source: "organizationConfig",
  assert: {
    property: "customerLockBoxEnabled",
    value: true,
  },
};
