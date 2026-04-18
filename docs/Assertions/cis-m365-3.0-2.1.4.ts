export default {
  id: "2.1.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Safe Attachments policy is enabled",
  requiresConnector: "defender-exchange", // Get-SafeAttachmentPolicy
  source: "safeAttachmentPolicies",
  assert: {
    property: "enable",
    value: true,
    also: [
      { property: "action",        value: "Block"                  },
      { property: "quarantineTag", value: "AdminOnlyAccessPolicy"  },
    ],
  },
};
