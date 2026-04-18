export default {
  id: "7.3.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "OneDrive sync is restricted for unmanaged devices",
  source: "spoTenant",
  // Get-PnPTenantSyncClientRestriction returns the same Tenant object
  // Properties are already in spoTenant
  assert: {
    property: "isUnmanagedSyncClientForTenantRestricted",
    value: true,
    also: [
      { property: "allowedDomainListForSyncClient", notEmpty: true },
    ],
  },
};
