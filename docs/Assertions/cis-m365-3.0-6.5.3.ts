export default {
  id: "6.5.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Additional storage providers are restricted in Outlook on the web",
  requiresConnector: "exchange-online", // Get-OwaMailboxPolicy -Identity OwaMailboxPolicy-Default
  source: "owaMailboxPolicies",
  assert: {
    filter: { identity: "OwaMailboxPolicy-Default" },
    property: "additionalStorageProvidersAvailable",
    value: false,
  },
};
