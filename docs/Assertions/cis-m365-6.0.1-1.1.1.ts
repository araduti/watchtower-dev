export default {
  slug: "wt.entra.admin-accounts-cloud-only",
  id: "1.1.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Administrative accounts are cloud-only",
  source: "privilegedUsers",
  assert: {
    property: "onPremisesSyncEnabled",
    value: false,
    scope: "principal",
  },
};
