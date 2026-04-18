export default {
  id: "6.5.5",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Direct Send submissions are rejected",
  requiresConnector: "exchange-online", // Get-OrganizationConfig | fl RejectDirectSend
  source: "organizationConfig",
  assert: {
    property: "rejectDirectSend",
    value: true,
  },
};
