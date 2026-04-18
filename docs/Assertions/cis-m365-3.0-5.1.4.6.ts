export default {
  id: "5.1.4.6",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Users are restricted from recovering BitLocker keys",
  source: "authorizationPolicy",
  assert: {
    property: "defaultUserRolePermissions.allowedToReadBitlockerKeysForOwnedDevice",
    value: false,
  },
};
