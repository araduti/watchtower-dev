export default {
  id: "5.1.8.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Password hash sync is enabled for hybrid deployments",
  manual: true,
  // Requires on-premises server access and ADSync PowerShell module (Get-ADSyncAADCompanyFeature)
  // Not applicable to cloud-only tenants — only applies to hybrid Entra Connect deployments
};
