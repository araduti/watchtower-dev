export default {
  slug: "wt.spo.guest-access-expiry-enabled",
  id: "7.2.9",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Guest access to a site or OneDrive will expire automatically",
  requiresConnector: "sharepoint-online",
  source: "spoTenant",
  assert: {
    property: "externalUserExpirationRequired",
    value: true,
    also: [
      { property: "externalUserExpireInDays", max: 30 },
    ],
  },
};
