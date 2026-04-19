export default {
  slug: "wt.entra.device.ga-not-local-admin-on-join",
  id: "5.1.4.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "GA role is not added as local administrator during Entra join",
  source: "deviceRegistrationPolicy",
  assert: {
    property: "azureADJoin.localAdmins.enableGlobalAdmins",
    value: false,
  },
};
