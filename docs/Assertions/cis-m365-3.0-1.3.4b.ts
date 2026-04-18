export default {
  id: "1.3.4",
  part: 2,
  groupId: "1.3.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Users cannot start trials on behalf of the organization",
  source: "appsAndServices",
  assert: {
    property: "isAppAndServicesTrialEnabled",
    value: false,
  },
};
