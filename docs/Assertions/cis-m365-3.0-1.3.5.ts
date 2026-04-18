export default {
  id: "1.3.5",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Internal phishing protection for Forms is enabled",
  requiresScope: "OrgSettings-Forms.Read.All",
  source: "formsSettings",
  assert: {
    property: "isInOrgFormsPhishingScanEnabled",
    value: true,
  },
};
