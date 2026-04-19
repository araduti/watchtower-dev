export default {
  slug: "wt.spo.external-sharing-restricted",
  id: "7.2.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "External content sharing is restricted",
  source: "spoTenant",
  assert: {
    property: "sharingCapability",
    // CSOM returns integer: 0=Disabled, 1=ExternalUserSharingOnly, 3=ExistingExternalUserSharingOnly
    // 2=ExternalUserAndGuestSharing (FAIL)
    allowedValues: [0, 1, 3],
  },
};
