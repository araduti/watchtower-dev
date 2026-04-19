export default {
  slug: "wt.entra.security-group-creation-restricted",
  id: "5.1.3.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Users cannot create security groups",
  source: "authorizationPolicy",
  assert: {
    property: "defaultUserRolePermissions.allowedToCreateSecurityGroups",
    value: false,
  },
};
