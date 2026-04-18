export default {
  id: "2.1.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Notifications for internal users sending malware is enabled",
  requiresConnector: "defender-exchange", // Get-MalwareFilterPolicy
  source: "malwareFilterPolicies",
  assert: {
    property: "enableInternalSenderAdminNotifications",
    value: true,
    also: [
      { property: "internalSenderAdminAddress", notEmpty: true },
    ],
  },
};
