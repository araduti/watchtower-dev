export default {
  slug: "wt.entra.breakglass-activity-monitored",
  id: "2.2.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Emergency access account activity is monitored",
  manual: true,
  // Requires:
  // 1. Break-glass account IDs configured in DB (config.breakGlassAccounts)
  // 2. Defender for Cloud Apps activity policy verification
  // Neither is available yet — flag for future Defender for Cloud Apps connector
};
