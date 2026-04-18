export default {
  id: "8.2.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Organization cannot communicate with accounts in trial Teams tenants",
  source: "teamsFederationConfiguration",
  assert: {
    property: "externalAccessWithTrialTenants",
    value: "Blocked",
  },
};
