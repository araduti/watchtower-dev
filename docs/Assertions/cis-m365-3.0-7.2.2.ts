export default {
  slug: "wt.spo.aad-b2b-integration-enabled",
  id: "7.2.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "SharePoint and OneDrive integration with Azure AD B2B is enabled",
  // ⚠️  Microsoft enforcing this for all tenants starting May 2026 — will become permanently passing
  source: "spoTenant",
  assert: { property: "enableAzureADB2BIntegration", value: true },
};
