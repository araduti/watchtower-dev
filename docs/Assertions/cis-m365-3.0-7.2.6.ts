export default {
  slug: "wt.spo.external-sharing-allowed-domains",
  id: "7.2.6",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "SharePoint external sharing is restricted to allowed domains",
  requiresConnector: "sharepoint-online",
  source: "spoTenant",
  assert: {
    property: "sharingDomainRestrictionMode",
    value: "AllowList",
    also: [{ property: "sharingAllowedDomainList", notEmpty: true }],
  },
};
