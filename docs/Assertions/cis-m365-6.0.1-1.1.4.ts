export default {
  id: "1.1.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Administrative accounts use licenses with a reduced application footprint",
  source: "privilegedUsers",
  assert: {
    scope: "principal",
    property: "assignedLicenses",
    // Only Entra ID P1/P2 (no apps) are permitted on admin accounts.
    // An empty assignedLicenses array also passes.
    // SKU IDs are fixed Microsoft GUIDs, stable across all tenants.
    allowedValues: [
      "078d2b04-f1bd-4111-bbd4-b4b1b354cef4", // Microsoft Entra ID P1
      "84a661c4-e949-4bd2-a560-ed7766fcaf2b", // Microsoft Entra ID P2
    ],
  },
};
