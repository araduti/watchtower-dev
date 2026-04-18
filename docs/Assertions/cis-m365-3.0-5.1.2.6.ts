export default {
  id: "5.1.2.6",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "LinkedIn account connections is disabled",
  manual: true,
  // allowLinkedInInformationSharing is not present in /policies/authorizationPolicy
  // Must be verified via UI: Entra ID > Users > User settings > LinkedIn account connections
};
