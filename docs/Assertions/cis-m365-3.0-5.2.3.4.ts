export default {
  id: "5.2.3.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "All member users are MFA capable",
  source: "userRegistrationDetails",
  assert: {
    filter: { userType: "member" },
    property: "isMfaCapable",
    value: true,
  },
};
