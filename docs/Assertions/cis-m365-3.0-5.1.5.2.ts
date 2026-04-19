export default {
  slug: "wt.entra.app.admin-consent-workflow-enabled",
  id: "5.1.5.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Admin consent workflow is enabled",
  source: "adminConsentRequestPolicy",
  assert: {
    property: "isEnabled",
    value: true,
    also: [
      { property: "notifyReviewers",    value: true },
      { property: "remindersEnabled",   value: true },
    ],
  },
};
