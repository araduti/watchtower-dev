export default {
  slug: "wt.exo.calendar-external-sharing-disabled",
  id: "1.3.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "External sharing of calendars is not available",
  requiresConnector: "exchange-online", // Azure Function will inject this data later
  source: "sharingPolicies",
  assert: {
    filter: { name: "Default Sharing Policy" },
    property: "enabled",
    value: false,
  },
};
