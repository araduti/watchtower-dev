export default {
  id: "2.1.5",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Safe Attachments for SharePoint, OneDrive, and Microsoft Teams is enabled",
  requiresConnector: "defender-exchange", // Get-AtpPolicyForO365
  source: "atpPolicyForO365",
  assert: {
    property: "enableATPForSPOTeamsODB",
    value: true,
    also: [
      { property: "enableSafeDocs",      value: true  },
      { property: "allowSafeDocsOpen",   value: false },
    ],
  },
};
