export default {
  id: "5.1.2.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Restrict non-admin users from creating tenants is set to Yes",
  source: "authorizationPolicy",
  assert: {
    property: "defaultUserRolePermissions.allowedToCreateTenants",
    value: false,
  },
};
