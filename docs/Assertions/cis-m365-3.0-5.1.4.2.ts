export default {
  slug: "wt.entra.device.quota-limited",
  id: "5.1.4.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Maximum number of devices per user is limited",
  source: "deviceRegistrationPolicy",
  assert: {
    property: "userDeviceQuota",
    max: 20,
  },
};
