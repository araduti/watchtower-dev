export default {
  id: "7.2.7",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Link sharing is restricted in SharePoint and OneDrive",
  requiresConnector: "sharepoint-online",
  source: "spoTenant",
  assert: {
    property: "defaultSharingLinkType",
    allowedValues: ["Direct", "Internal"],
  },
};
