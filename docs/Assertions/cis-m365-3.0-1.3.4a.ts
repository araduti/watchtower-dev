export default {
  slug: "wt.m365.office-store-disabled",
  id: "1.3.4",
  part: 1,
  groupId: "1.3.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Users cannot access the Office Store",
  source: "appsAndServices",
  assert: {
    property: "isOfficeStoreEnabled",
    value: false,
  },
};
