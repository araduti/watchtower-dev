export default {
  id: "7.2.8",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "External sharing is restricted by security group",
  manual: true,
  // "Allow only users in specific security groups to share externally" not exposed
  // via Graph or Get-SPOTenant — UI-only verification required
  // Navigate to: SharePoint admin center > Policies > Sharing > More external sharing settings
};
