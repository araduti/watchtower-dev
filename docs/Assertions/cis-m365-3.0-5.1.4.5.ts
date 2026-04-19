export default {
  slug: "wt.entra.device.laps-enabled",
  id: "5.1.4.5",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Local Administrator Password Solution (LAPS) is enabled",
  source: "deviceRegistrationPolicy",
  assert: {
    property: "localAdminPassword.isEnabled",
    value: true,
  },
};
