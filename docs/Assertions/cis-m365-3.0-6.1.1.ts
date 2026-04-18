export default {
  id: "6.1.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "AuditDisabled organizationally is set to False",
  requiresConnector: "exchange-online", // Get-OrganizationConfig | fl AuditDisabled
  source: "organizationConfig",
  assert: {
    property: "auditDisabled",
    value: false,
  },
};
