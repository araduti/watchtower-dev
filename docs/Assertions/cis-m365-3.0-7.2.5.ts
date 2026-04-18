export default {
  id: "7.2.5",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "SharePoint guest users cannot share items they don't own",
  requiresConnector: "sharepoint-online",
  // PreventExternalUsersFromResharing not exposed in Graph /admin/sharepoint/settings
  // Only available via Get-SPOTenant (SharePoint Online Management Shell)
  source: "spoTenant",
  assert: {
    property: "preventExternalUsersFromResharing",
    value: true,
  },
};
