export default {
  slug: "wt.exo.audit-bypass-disabled",
  id: "6.1.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "AuditBypassEnabled is not enabled on mailboxes",
  requiresConnector: "exchange-online", // Get-MailboxAuditBypassAssociation -ResultSize unlimited
  source: "mailboxAuditBypassAssociations",
  assert: {
    property: "auditBypassEnabled",
    value: true,
    negate: true, // FAIL if any item has auditBypassEnabled = true
  },
};
