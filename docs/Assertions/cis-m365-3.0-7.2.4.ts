export default {
  slug: "wt.spo.onedrive-sharing-restricted",
  id: "7.2.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "OneDrive content sharing is restricted",
  source: "spoTenant",
  assert: {
    property: "oDBSharingCapability",
    value: 0, // CSOM: 0=Disabled (Only people in org) — PASS; 2=ExternalUserAndGuestSharing — FAIL
  },
};
