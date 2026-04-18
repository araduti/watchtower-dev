export default {
  id: "8.1.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Users can't send emails to a channel email address",
  source: "teamsClientConfiguration",
  assert: {
    property: "allowEmailIntoChannel",
    value: false,
  },
};
