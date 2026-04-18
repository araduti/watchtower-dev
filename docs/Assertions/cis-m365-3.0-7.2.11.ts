export default {
  id: "7.2.11",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "SharePoint default sharing link permission is set to View",
  requiresConnector: "sharepoint-online",
  source: "spoTenant",
  assert: {
    property: "defaultLinkPermission",
    value: "View",
  },
};
