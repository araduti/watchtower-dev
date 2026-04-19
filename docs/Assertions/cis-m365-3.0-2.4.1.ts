export default {
  slug: "wt.defender.priority-account-protection-enabled",
  id: "2.4.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Priority account protection is enabled and configured",
  requiresConnector: "defender-exchange",
  // 3-part check:
  // Part 1: Priority account protection enabled
  //   GET /beta/security/email/microsoftDefenderForOffice365/priorityAccountProtection — needs investigation
  // Part 2: Priority accounts tagged
  //   User tags API not available in Graph — Defender for Office 365 API only
  // Part 3: Alert policies for priority accounts
  //   GET /security/alertPolicies — not available in Graph v1/beta
  source: "priorityAccountProtection",
  assert: {
    property: "isEnabled",
    value: true,
  },
};
