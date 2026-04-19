export default {
  slug: "wt.intune.default-noncompliant-devices",
  id: "4.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Devices without a compliance policy are marked 'not compliant'",
  source: "deviceManagementSettings",
  assert: {
    property: "secureByDefault",
    value: true,
  },
};
