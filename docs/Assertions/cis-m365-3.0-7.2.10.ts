export default {
  slug: "wt.spo.verification-code-reauth-restricted",
  id: "7.2.10",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Reauthentication with verification code is restricted",
  requiresConnector: "sharepoint-online",
  source: "spoTenant",
  assert: {
    property: "emailAttestationRequired",
    value: true,
    also: [
      { property: "emailAttestationReAuthDays", max: 15 },
    ],
  },
};
