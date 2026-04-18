export default {
  id: "3.1.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Microsoft 365 audit log search is enabled",
  requiresConnector: "defender-exchange", // Get-AdminAuditLogConfig
  source: "adminAuditLogConfig",
  assert: {
    property: "unifiedAuditLogIngestionEnabled",
    value: true,
  },
};
