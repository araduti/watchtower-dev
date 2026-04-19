export default {
  slug: "wt.entra.admin-center-access-restricted",
  id: "5.1.2.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Access to the Entra admin center is restricted",
  manual: true,
  // "Restrict access to Microsoft Entra admin center" is not exposed via Graph API
  // Must be verified via UI: Entra ID > Users > User settings > Administration center
};
