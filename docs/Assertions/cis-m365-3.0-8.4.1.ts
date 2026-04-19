export default {
  slug: "wt.teams.app-permission-policies-configured",
  id: "8.4.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "App permission policies are configured",
  manual: true,
  // Endpoint: GET https://teams.microsoft.com/api/mt/part/{region}/beta/users/tenantWideAppsSettings
  // Audience: https://api.spaces.skype.com — Teams client API, not admin API
  // Cannot be accessed with app-only (client credentials) tokens
  // Requires: Teams admin center UI → Teams apps → Manage apps → Org-wide app settings
  // Check: isExternalAppsEnabledByDefault=false, isSideloadedAppsInteractionEnabled=false
};
