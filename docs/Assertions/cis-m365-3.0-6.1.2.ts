export default {
  slug: "wt.exo.mailbox-audit-actions",
  id: "6.1.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Mailbox audit actions are configured",
  requiresConnector: "exchange-online", // Get-EXOMailbox -PropertySets Audit,Minimum | Where RecipientTypeDetails -eq UserMailbox
  source: "userMailboxes",
  // Per-mailbox check: AuditEnabled = true AND all required actions present
  // Required admin actions: ApplyRecord, Copy, Create, FolderBind, HardDelete, MailItemsAccessed,
  //   Move, MoveToDeletedItems, SendAs, SendOnBehalf, Send, SoftDelete, Update,
  //   UpdateCalendarDelegation, UpdateFolderPermissions, UpdateInboxRules
  // Required delegate actions: ApplyRecord, Create, FolderBind, HardDelete, Move,
  //   MailItemsAccessed, MoveToDeletedItems, SendAs, SendOnBehalf, SoftDelete, Update,
  //   UpdateFolderPermissions, UpdateInboxRules
  // Required owner actions: ApplyRecord, Create, HardDelete, MailboxLogin, Move,
  //   MailItemsAccessed, MoveToDeletedItems, Send, SoftDelete, Update,
  //   UpdateCalendarDelegation, UpdateFolderPermissions, UpdateInboxRules
  assert: {
    property: "auditEnabled",
    value: true,
    also: [
      { property: "auditAdminActionsCompliant",    value: true },
      { property: "auditDelegateActionsCompliant",  value: true },
      { property: "auditOwnerActionsCompliant",     value: true },
    ],
  },
  // Note: connector should pre-compute the *Compliant booleans by comparing
  // auditAdmin/auditDelegate/auditOwner arrays against the required action lists above
};
