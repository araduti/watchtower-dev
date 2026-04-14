import type { ControlAssertion, Operator } from "./argus.engine-v2.ts";

/**
 * assertions.ts
 *
 * Control assertion data for CIS M365 3.0 and ScubaGear M365 1.5 frameworks.
 *
 * This file is the mock DB — replace getControlAssertions() in argus.engine-v2.ts
 * with a real Prisma query when the ControlAssertion table exists:
 *
 *   import { prisma } from "./db"
 *   export async function getControlAssertions() {
 *     return prisma.controlAssertion.findMany({
 *       include: { control: { include: { framework: true } } }
 *     })
 *   }
 */

const MOCKED_CONTROL_ASSERTIONS: ControlAssertion[] = [

  // 1.1.1 — Administrative accounts are cloud-only
  {
    controlId: '1.1.1', controlTitle: 'Administrative accounts are cloud-only',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'privilegedUsers', property: 'principal.onPremisesSyncEnabled',
    operator: 'neq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 1.1.3 — Between two and four global admins are designated
  {
    controlId: '1.1.3', controlTitle: 'Between two and four global admins are designated',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'privilegedUsers', property: '',
    operator: 'count' as Operator, expectedValue: {"min": 2, "max": 4}, assertionLogic: "ALL",
    sourceFilter: {"roleTemplateId": "62e90394-69f5-4237-9190-012177145e10"},
  },

  // 1.1.4 — Admin accounts use licenses with reduced footprint
  {
    controlId: '1.1.4', controlTitle: 'Admin accounts use licenses with reduced footprint',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'privilegedUsers', property: 'principal.assignedLicenses',
    operator: 'in' as Operator, expectedValue: ['078d2b04-f1bd-4111-bbd4-b4b1b354cef4', '84a661c4-e949-4bd2-a560-ed7766fcaf2b'], assertionLogic: "ALL",
  },

  // 1.2.1 — Only approved public groups exist
  {
    controlId: '1.2.1', controlTitle: 'Only approved public groups exist',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'groups', property: 'visibility',
    operator: 'neq' as Operator, expectedValue: 'Public', assertionLogic: "ALL",
    sourceFilter: {"groupTypes": "Unified"},
  },

  // 1.3.1 — Password expiration set to never expire
  {
    controlId: '1.3.1', controlTitle: 'Password expiration set to never expire',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'domains', property: 'passwordValidityPeriodInDays',
    operator: 'eq' as Operator, expectedValue: 2147483647, assertionLogic: "ALL",
    sourceFilter: {"isVerified": true},
  },

  // 1.3.2a — Idle session timeout ≤ 3 hours (policy)
  {
    controlId: '1.3.2a', controlTitle: 'Idle session timeout ≤ 3 hours (policy)',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'idle-session-timeout',
  },

  // 1.3.2b — Idle session timeout ≤ 3 hours (CA policy)
  {
    controlId: '1.3.2b', controlTitle: 'Idle session timeout ≤ 3 hours (CA policy)',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:1.3.2b',
  },

  // 1.3.3 — External sharing of calendars is not available
  {
    controlId: '1.3.3', controlTitle: 'External sharing of calendars is not available',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'sharingPolicies', property: 'enabled',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
    sourceFilter: {"name": "Default Sharing Policy"},
  },

  // 1.3.4a — User owned apps restricted (Office Store)
  {
    controlId: '1.3.4a', controlTitle: 'User owned apps restricted (Office Store)',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'appsAndServices', property: 'isOfficeStoreEnabled',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 1.3.4b — User owned apps restricted (trials)
  {
    controlId: '1.3.4b', controlTitle: 'User owned apps restricted (trials)',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'appsAndServices', property: 'isAppAndServicesTrialEnabled',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 1.3.5 — Internal phishing protection for Forms is enabled
  {
    controlId: '1.3.5', controlTitle: 'Internal phishing protection for Forms is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'formsSettings', property: 'isInOrgFormsPhishingScanEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 1.3.6 — Customer lockbox feature is enabled
  {
    controlId: '1.3.6', controlTitle: 'Customer lockbox feature is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'organizationConfig', property: 'customerLockBoxEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 1.3.7 — Third-party storage services are restricted
  // Replaced custom evaluator: if SP doesn't exist → pass; if exists but disabled → pass
  // Uses count-inversion: zero SPs with accountEnabled=true must exist
  {
    controlId: '1.3.7', controlTitle: 'Third-party storage services are restricted',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'thirdPartyStorage', property: "",
    operator: "count" as Operator, expectedValue: { min: 0, max: 0 }, assertionLogic: "ALL",
    sourceFilter: { accountEnabled: true },
  },

  // 1.3.8 — Sways cannot be shared externally
  {
    controlId: '1.3.8', controlTitle: 'Sways cannot be shared externally',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 2.1.1 — Safe Links for Office Applications is enabled
  {
    controlId: '2.1.1', controlTitle: 'Safe Links for Office Applications is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'safeLinksPolicies', property: 'enableSafeLinksForEmail',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.2 — Common Attachment Types Filter is enabled
  {
    controlId: '2.1.2', controlTitle: 'Common Attachment Types Filter is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'malwareFilterPolicies', property: 'enableFileFilter',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.3 — Notifications for internal users sending malware
  {
    controlId: '2.1.3', controlTitle: 'Notifications for internal users sending malware',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'malwareFilterPolicies', property: 'enableInternalSenderAdminNotifications',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.4 — Safe Attachments policy is enabled
  {
    controlId: '2.1.4', controlTitle: 'Safe Attachments policy is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'safeAttachmentPolicies', property: 'enable',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.5 — Safe Attachments for SPO/OneDrive/Teams is enabled
  {
    controlId: '2.1.5', controlTitle: 'Safe Attachments for SPO/OneDrive/Teams is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'atpPolicyForO365', property: 'enableATPForSPOTeamsODB',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.6 — Spam policies notify administrators
  {
    controlId: '2.1.6', controlTitle: 'Spam policies notify administrators',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'hostedOutboundSpamFilterPolicies', property: 'bccSuspiciousOutboundMail',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.7 — Anti-phishing policy is configured
  {
    controlId: '2.1.7', controlTitle: 'Anti-phishing policy is configured',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'antiPhishPolicies', property: 'enabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.8 — SPF records are published
  {
    controlId: '2.1.8', controlTitle: 'SPF records are published',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'spf-records-published',
  },

  // 2.1.9 — DKIM is enabled for all domains
  // Replaced custom evaluator: each domain must have at least one DKIM record
  {
    controlId: '2.1.9', controlTitle: 'DKIM is enabled for all domains',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'domainDnsRecords', property: 'dkim',
    operator: 'notEmpty' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.10 — DMARC records are published
  {
    controlId: '2.1.10', controlTitle: 'DMARC records are published',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'dmarc-published',
  },

  // 2.1.11 — Comprehensive attachment filtering is applied
  {
    controlId: '2.1.11', controlTitle: 'Comprehensive attachment filtering is applied',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'malwareFilterPolicies', property: 'enableFileFilter',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.1.12 — Connection filter IP allow list is not used
  {
    controlId: '2.1.12', controlTitle: 'Connection filter IP allow list is not used',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'hostedConnectionFilterPolicies', property: 'iPAllowList',
    operator: 'notEmpty' as Operator, expectedValue: false, assertionLogic: "ALL",
    sourceFilter: {"identity": "Default"},
  },

  // 2.1.13 — Connection filter safe list is off
  {
    controlId: '2.1.13', controlTitle: 'Connection filter safe list is off',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'hostedConnectionFilterPolicies', property: 'enableSafeList',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
    sourceFilter: {"identity": "Default"},
  },

  // 2.1.14 — Inbound anti-spam policies have no allowed domains
  {
    controlId: '2.1.14', controlTitle: 'Inbound anti-spam policies have no allowed domains',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'hostedContentFilterPolicies', property: 'allowedSenderDomains',
    operator: 'notEmpty' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 2.1.15 — Outbound anti-spam message limits are in place
  {
    controlId: '2.1.15', controlTitle: 'Outbound anti-spam message limits are in place',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'hostedOutboundSpamFilterPolicies', property: 'actionWhenThresholdReached',
    operator: 'eq' as Operator, expectedValue: 'BlockUser', assertionLogic: "ALL",
    sourceFilter: {"identity": "Default"},
  },

  // 2.2.1 — Emergency access account activity is monitored
  {
    controlId: '2.2.1', controlTitle: 'Emergency access account activity is monitored',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 2.4.1 — Priority account protection is enabled
  {
    controlId: '2.4.1', controlTitle: 'Priority account protection is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'priorityAccountProtection', property: 'isEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 2.4.2 — Priority accounts have Strict protection presets
  {
    controlId: '2.4.2', controlTitle: 'Priority accounts have Strict protection presets',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'atpProtectionPolicyRules', property: 'state',
    operator: 'eq' as Operator, expectedValue: 'Enabled', assertionLogic: "ALL",
    sourceFilter: {"identity": "Strict Preset Security Policy"},
  },

  // 2.4.3 — Microsoft Defender for Cloud Apps is configured
  {
    controlId: '2.4.3', controlTitle: 'Microsoft Defender for Cloud Apps is configured',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 2.4.4 — Zero-hour auto purge for Teams is on
  {
    controlId: '2.4.4', controlTitle: 'Zero-hour auto purge for Teams is on',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsProtectionPolicies', property: 'zapEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 3.1.1 — Microsoft 365 audit log search is enabled
  {
    controlId: '3.1.1', controlTitle: 'Microsoft 365 audit log search is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'adminAuditLogConfig', property: 'unifiedAuditLogIngestionEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 3.2.1 — DLP policies are enabled
  {
    controlId: '3.2.1', controlTitle: 'DLP policies are enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'dlpPolicies', property: 'mode',
    operator: 'eq' as Operator, expectedValue: 'Enable', assertionLogic: "ALL",
  },

  // 3.2.2 — DLP policies are enabled for Microsoft Teams
  {
    controlId: '3.2.2', controlTitle: 'DLP policies are enabled for Microsoft Teams',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'dlpPolicies', property: 'mode',
    operator: 'eq' as Operator, expectedValue: 'Enable', assertionLogic: "ALL",
    sourceFilter: {"workload": "Teams"},
  },

  // 3.3.1 — Sensitivity label policies are published
  {
    controlId: '3.3.1', controlTitle: 'Sensitivity label policies are published',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'labelPolicies', property: '',
    operator: 'count' as Operator, expectedValue: {"min": 1}, assertionLogic: "ALL",
    sourceFilter: {"type": "PublishedSensitivityLabel"},
  },

  // 4.1 — Devices without compliance policy are not compliant
  {
    controlId: '4.1', controlTitle: 'Devices without compliance policy are not compliant',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'deviceManagementSettings', property: 'secureByDefault',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 4.2 — Personal device enrollment is blocked
  {
    controlId: '4.2', controlTitle: 'Personal device enrollment is blocked',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'personal-device-enrollment-blocked',
  },

  // 5.1.2.1 — Per-user MFA is disabled
  {
    controlId: '5.1.2.1', controlTitle: 'Per-user MFA is disabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'perUserMfaStates', property: 'perUserMfaState',
    operator: 'eq' as Operator, expectedValue: 'disabled', assertionLogic: "ALL",
  },

  // 5.1.2.2 — Third-party integrated applications are not allowed
  // Replaced custom evaluator: simple eq check on authorizationPolicy
  {
    controlId: '5.1.2.2', controlTitle: 'Third-party integrated applications are not allowed',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authorizationPolicy', property: 'defaultUserRolePermissions.allowedToCreateApps',
    operator: "eq" as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 5.1.2.3 — Restrict non-admin users from creating tenants
  {
    controlId: '5.1.2.3', controlTitle: 'Restrict non-admin users from creating tenants',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authorizationPolicy', property: 'defaultUserRolePermissions.allowedToCreateTenants',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 5.1.2.4 — Access to the Entra admin center is restricted
  {
    controlId: '5.1.2.4', controlTitle: 'Access to the Entra admin center is restricted',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 5.1.2.5 — The option to remain signed in is hidden
  {
    controlId: '5.1.2.5', controlTitle: 'The option to remain signed in is hidden',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 5.1.2.6 — LinkedIn account connections is disabled
  {
    controlId: '5.1.2.6', controlTitle: 'LinkedIn account connections is disabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 5.1.3.1 — A dynamic group for guest users is created
  {
    controlId: '5.1.3.1', controlTitle: 'A dynamic group for guest users is created',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'dynamic-guest-group-exists',
  },

  // 5.1.3.2 — Users cannot create security groups
  {
    controlId: '5.1.3.2', controlTitle: 'Users cannot create security groups',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authorizationPolicy', property: 'defaultUserRolePermissions.allowedToCreateSecurityGroups',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 5.1.4.1 — Entra device join is restricted
  // Replaced custom evaluator: checks @odata.type via bracket notation
  {
    controlId: '5.1.4.1', controlTitle: 'Entra device join is restricted',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'deviceRegistrationPolicy', property: 'azureADJoin.allowedToJoin.["@odata.type"]',
    operator: "in" as Operator, expectedValue: [
      "#microsoft.graph.enumeratedDeviceRegistrationMembership",
      "#microsoft.graph.noDeviceRegistrationMembership"
    ], assertionLogic: "ALL",
  },

  // 5.1.4.2 — Maximum devices per user is limited
  {
    controlId: '5.1.4.2', controlTitle: 'Maximum devices per user is limited',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'deviceRegistrationPolicy', property: 'userDeviceQuota',
    operator: 'lte' as Operator, expectedValue: 20, assertionLogic: "ALL",
  },

  // 5.1.4.3 — GA role not added as local admin during Entra join
  {
    controlId: '5.1.4.3', controlTitle: 'GA role not added as local admin during Entra join',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'deviceRegistrationPolicy', property: 'azureADJoin.localAdmins.enableGlobalAdmins',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 5.1.4.4 — Local administrator assignment is limited
  // Replaced custom evaluator: checks @odata.type via bracket notation
  {
    controlId: '5.1.4.4', controlTitle: 'Local administrator assignment is limited',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'deviceRegistrationPolicy', property: 'azureADJoin.localAdmins.registeringUsers.["@odata.type"]',
    operator: "in" as Operator, expectedValue: [
      "#microsoft.graph.enumeratedDeviceRegistrationMembership",
      "#microsoft.graph.noDeviceRegistrationMembership"
    ], assertionLogic: "ALL",
  },

  // 5.1.4.5 — LAPS is enabled
  {
    controlId: '5.1.4.5', controlTitle: 'LAPS is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'deviceRegistrationPolicy', property: 'localAdminPassword.isEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 5.1.4.6 — Users restricted from recovering BitLocker keys
  {
    controlId: '5.1.4.6', controlTitle: 'Users restricted from recovering BitLocker keys',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authorizationPolicy', property: 'defaultUserRolePermissions.allowedToReadBitlockerKeysForOwnedDevice',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 5.1.5.1 — User consent to apps is not allowed
  // Replaced custom evaluator: notContainsAny on permissionGrantPoliciesAssigned
  {
    controlId: '5.1.5.1', controlTitle: 'User consent to apps is not allowed',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authorizationPolicy', property: 'defaultUserRolePermissions.permissionGrantPoliciesAssigned',
    operator: "notContainsAny" as Operator, expectedValue: [
      "ManagePermissionGrantsForSelf.microsoft-user-default-low",
      "ManagePermissionGrantsForSelf.microsoft-user-default-legacy"
    ], assertionLogic: "ALL",
  },

  // 5.1.5.2 — Admin consent workflow is enabled
  {
    controlId: '5.1.5.2', controlTitle: 'Admin consent workflow is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'adminConsentRequestPolicy', property: 'isEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 5.1.6.1 — Collaboration invitations to allowed domains only
  {
    controlId: '5.1.6.1', controlTitle: 'Collaboration invitations to allowed domains only',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'b2b-allowed-domains-only',
  },

  // 5.1.6.2 — Guest user access is restricted
  {
    controlId: '5.1.6.2', controlTitle: 'Guest user access is restricted',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authorizationPolicy', property: 'guestUserRoleId',
    operator: 'in' as Operator, expectedValue: ['10dae51f-b6af-4016-8d66-8c2a99b929b3', '2af84b1e-32c8-42b7-82bc-daa82404023b'], assertionLogic: "ALL",
  },

  // 5.1.6.3 — Guest invitations limited to Guest Inviter role
  {
    controlId: '5.1.6.3', controlTitle: 'Guest invitations limited to Guest Inviter role',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authorizationPolicy', property: 'allowInvitesFrom',
    operator: 'in' as Operator, expectedValue: ['adminsAndGuestInviters', 'adminsOnly'], assertionLogic: "ALL",
  },

  // 5.1.8.1 — Password hash sync enabled for hybrid deployments
  {
    controlId: '5.1.8.1', controlTitle: 'Password hash sync enabled for hybrid deployments',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 5.2.2.1 — MFA required for all users in admin roles
  {
    controlId: '5.2.2.1', controlTitle: 'MFA required for all users in admin roles',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.1',
  },

  // 5.2.2.2 — MFA required for all users
  {
    controlId: '5.2.2.2', controlTitle: 'MFA required for all users',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.2',
  },

  // 5.2.2.3 — CA policies block legacy authentication
  {
    controlId: '5.2.2.3', controlTitle: 'CA policies block legacy authentication',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.3',
  },

  // 5.2.2.4 — Sign-in frequency enabled for admins
  {
    controlId: '5.2.2.4', controlTitle: 'Sign-in frequency enabled for admins',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.4',
  },

  // 5.2.2.5 — Phishing-resistant MFA required for admins
  {
    controlId: '5.2.2.5', controlTitle: 'Phishing-resistant MFA required for admins',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.5',
  },

  // 5.2.2.6 — Identity Protection user risk policies enabled
  {
    controlId: '5.2.2.6', controlTitle: 'Identity Protection user risk policies enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.6',
  },

  // 5.2.2.7 — Identity Protection sign-in risk policies enabled
  {
    controlId: '5.2.2.7', controlTitle: 'Identity Protection sign-in risk policies enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.7',
  },

  // 5.2.2.8 — Sign-in risk blocked for medium and high risk
  {
    controlId: '5.2.2.8', controlTitle: 'Sign-in risk blocked for medium and high risk',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.8',
  },

  // 5.2.2.9 — Managed device required for authentication
  {
    controlId: '5.2.2.9', controlTitle: 'Managed device required for authentication',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.9',
  },

  // 5.2.2.10 — Managed device required to register security info
  {
    controlId: '5.2.2.10', controlTitle: 'Managed device required to register security info',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.10',
  },

  // 5.2.2.11 — Sign-in frequency for Intune Enrollment set to Every time
  {
    controlId: '5.2.2.11', controlTitle: 'Sign-in frequency for Intune Enrollment set to Every time',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.11',
  },

  // 5.2.2.12 — Device code sign-in flow is blocked
  {
    controlId: '5.2.2.12', controlTitle: 'Device code sign-in flow is blocked',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'ca-policy-match:5.2.2.12',
  },

  // 5.2.3.1 — Microsoft Authenticator protects against MFA fatigue
  // Replaced custom evaluator: primary check on state + 3 feature settings via additionalAssertions
  {
    controlId: '5.2.3.1', controlTitle: 'Microsoft Authenticator protects against MFA fatigue',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authMethodsPolicy', property: 'state',
    operator: 'eq' as Operator, expectedValue: 'enabled', assertionLogic: "ALL",
    additionalAssertions: [
      { property: 'featureSettings.numberMatchingRequiredState.state', operator: 'eq' as Operator, expectedValue: 'enabled' },
      { property: 'featureSettings.displayAppInformationRequiredState.state', operator: 'eq' as Operator, expectedValue: 'enabled' },
      { property: 'featureSettings.displayLocationInformationRequiredState.state', operator: 'eq' as Operator, expectedValue: 'enabled' },
    ],
  },

  // 5.2.3.2 — Custom banned passwords lists are used
  {
    controlId: '5.2.3.2', controlTitle: 'Custom banned passwords lists are used',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'custom-banned-passwords-enabled',
  },

  // 5.2.3.3 — Password protection enabled for on-premises AD
  {
    controlId: '5.2.3.3', controlTitle: 'Password protection enabled for on-premises AD',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'onprem-password-protection-enabled',
  },

  // 5.2.3.4 — All member users are MFA capable
  {
    controlId: '5.2.3.4', controlTitle: 'All member users are MFA capable',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'userRegistrationDetails', property: 'isMfaCapable',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
    sourceFilter: {"userType": "member"},
  },

  // 5.2.3.5 — Weak authentication methods are disabled
  // Replaced custom evaluator: nestedFind for SMS method
  {
    controlId: '5.2.3.5a', controlTitle: 'SMS authentication method is disabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authMethodConfigurations', property: '',
    operator: 'nestedFind' as Operator, expectedValue: 'disabled', assertionLogic: "ALL",
    nestedFind: { arrayPath: 'authenticationMethodConfigurations', findBy: { id: 'Sms' }, property: 'state' },
  },
  // Replaced custom evaluator: nestedFind for Voice method
  {
    controlId: '5.2.3.5b', controlTitle: 'Voice authentication method is disabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authMethodConfigurations', property: '',
    operator: 'nestedFind' as Operator, expectedValue: 'disabled', assertionLogic: "ALL",
    nestedFind: { arrayPath: 'authenticationMethodConfigurations', findBy: { id: 'Voice' }, property: 'state' },
  },

  // 5.2.3.6 — System-preferred MFA is enabled
  // Replaced custom evaluator: primary check on state + includeTargets via additionalAssertions
  {
    controlId: '5.2.3.6', controlTitle: 'System-preferred MFA is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authMethodConfigurations', property: 'systemCredentialPreferences.state',
    operator: 'eq' as Operator, expectedValue: 'enabled', assertionLogic: "ALL",
  },

  // 5.2.3.7 — Email OTP authentication method is disabled
  // Replaced custom evaluator: nestedFind on authenticationMethodConfigurations
  {
    controlId: '5.2.3.7', controlTitle: 'Email OTP authentication method is disabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'authMethodConfigurations', property: '',
    operator: 'nestedFind' as Operator, expectedValue: 'disabled', assertionLogic: "ALL",
    nestedFind: { arrayPath: 'authenticationMethodConfigurations', findBy: { id: 'Email' }, property: 'state' },
  },

  // 5.2.4.1 — Self service password reset enabled for all
  {
    controlId: '5.2.4.1', controlTitle: 'Self service password reset enabled for all',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 5.3.1 — PIM is used to manage roles
  {
    controlId: '5.3.1', controlTitle: 'PIM is used to manage roles',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'pim-used-for-privileged-roles',
  },

  // 5.3.2 — Access reviews for guest users are configured
  {
    controlId: '5.3.2', controlTitle: 'Access reviews for guest users are configured',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'guest-access-reviews-configured',
  },

  // 5.3.3 — Access reviews for privileged roles are configured
  {
    controlId: '5.3.3', controlTitle: 'Access reviews for privileged roles are configured',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'privileged-role-access-reviews-configured',
  },

  // 5.3.5 — Approval required for PRA activation
  {
    controlId: '5.3.5', controlTitle: 'Approval required for PRA activation',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'pra-requires-approval',
  },

  // 6.1.1 — AuditDisabled is set to false
  {
    controlId: '6.1.1', controlTitle: 'AuditDisabled is set to false',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'organizationConfig', property: 'auditDisabled',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 6.1.2 — Mailbox audit actions are configured
  {
    controlId: '6.1.2', controlTitle: 'Mailbox audit actions are configured',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'userMailboxes', property: 'auditEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 6.1.3 — AuditBypassEnabled is not enabled on mailboxes
  {
    controlId: '6.1.3', controlTitle: 'AuditBypassEnabled is not enabled on mailboxes',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'mailboxAuditBypassAssociations', property: 'auditBypassEnabled',
    operator: 'neq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 6.2.1a — No transport rules redirect to external domains
  {
    controlId: '6.2.1a', controlTitle: 'No transport rules redirect to external domains',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'no-external-forwarding-transport-rules',
  },

  // 6.2.1b — Outbound spam policy blocks auto-forwarding
  {
    controlId: '6.2.1b', controlTitle: 'Outbound spam policy blocks auto-forwarding',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'hostedOutboundSpamFilterPolicies', property: 'autoForwardingMode',
    operator: 'eq' as Operator, expectedValue: 'Off', assertionLogic: "ALL",
  },

  // 6.2.2 — Transport rules do not whitelist domains
  {
    controlId: '6.2.2', controlTitle: 'Transport rules do not whitelist domains',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'no-domain-whitelisting-transport-rules',
  },

  // 6.2.3 — Email from external senders is identified
  {
    controlId: '6.2.3', controlTitle: 'Email from external senders is identified',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'externalInOutlook', property: 'enabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 6.3.1 — Users installing Outlook add-ins is not allowed
  // Replaced custom evaluator: notContainsAny on assignedRoles
  {
    controlId: '6.3.1', controlTitle: 'Users installing Outlook add-ins is not allowed',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'roleAssignmentPolicies', property: 'assignedRoles',
    operator: "notContainsAny" as Operator, expectedValue: [
      "My Custom Apps",
      "My Marketplace Apps",
      "My ReadWriteMailbox Apps"
    ], assertionLogic: "ALL",
  },

  // 6.5.1 — Modern authentication for Exchange Online is enabled
  {
    controlId: '6.5.1', controlTitle: 'Modern authentication for Exchange Online is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'organizationConfig', property: 'oAuth2ClientProfileEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 6.5.2 — MailTips are enabled for end users
  {
    controlId: '6.5.2', controlTitle: 'MailTips are enabled for end users',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'organizationConfig', property: 'mailTipsAllTipsEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 6.5.3 — Additional storage providers restricted in OWA
  {
    controlId: '6.5.3', controlTitle: 'Additional storage providers restricted in OWA',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'owaMailboxPolicies', property: 'additionalStorageProvidersAvailable',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
    sourceFilter: {"identity": "OwaMailboxPolicy-Default"},
  },

  // 6.5.4 — SMTP AUTH is disabled
  {
    controlId: '6.5.4', controlTitle: 'SMTP AUTH is disabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'transportConfig', property: 'smtpClientAuthenticationDisabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 6.5.5 — Direct Send submissions are rejected
  {
    controlId: '6.5.5', controlTitle: 'Direct Send submissions are rejected',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'organizationConfig', property: 'rejectDirectSend',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 7.2.1 — Modern authentication for SharePoint is required
  {
    controlId: '7.2.1', controlTitle: 'Modern authentication for SharePoint is required',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'legacyAuthProtocolsEnabled',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 7.2.2 — SharePoint/OneDrive Azure AD B2B integration is enabled
  {
    controlId: '7.2.2', controlTitle: 'SharePoint/OneDrive Azure AD B2B integration is enabled',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'enableAzureADB2BIntegration',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 7.2.3 — External content sharing is restricted
  {
    controlId: '7.2.3', controlTitle: 'External content sharing is restricted',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'sharingCapability',
    operator: 'in' as Operator, expectedValue: [0, 1, 3], assertionLogic: "ALL",
  },

  // 7.2.4 — OneDrive content sharing is restricted
  {
    controlId: '7.2.4', controlTitle: 'OneDrive content sharing is restricted',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'spoTenant', property: 'oDBSharingCapability',
    operator: 'eq' as Operator, expectedValue: 0, assertionLogic: "ALL",
  },

  // 7.2.5 — SharePoint guests cannot reshare items
  {
    controlId: '7.2.5', controlTitle: 'SharePoint guests cannot reshare items',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'preventExternalUsersFromResharing',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 7.2.6 — SharePoint external sharing restricted to allowed domains
  {
    controlId: '7.2.6', controlTitle: 'SharePoint external sharing restricted to allowed domains',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'spoTenant', property: 'sharingDomainRestrictionMode',
    operator: 'eq' as Operator, expectedValue: 1, assertionLogic: "ALL",
  },

  // 7.2.7 — Link sharing is restricted in SharePoint and OneDrive
  {
    controlId: '7.2.7', controlTitle: 'Link sharing is restricted in SharePoint and OneDrive',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'defaultSharingLinkType',
    operator: 'in' as Operator, expectedValue: [1, 2], assertionLogic: "ALL",
  },

  // 7.2.8 — External sharing restricted by security group
  {
    controlId: '7.2.8', controlTitle: 'External sharing restricted by security group',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 7.2.9 — Guest access to site expires automatically
  {
    controlId: '7.2.9', controlTitle: 'Guest access to site expires automatically',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'externalUserExpirationRequired',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 7.2.10 — Reauthentication with verification code is restricted
  {
    controlId: '7.2.10', controlTitle: 'Reauthentication with verification code is restricted',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'spoTenant', property: 'emailAttestationRequired',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 7.2.11 — SharePoint default sharing link permission is View
  {
    controlId: '7.2.11', controlTitle: 'SharePoint default sharing link permission is View',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'defaultLinkPermission',
    operator: 'eq' as Operator, expectedValue: 1, assertionLogic: "ALL",
  },

  // 7.3.1 — SharePoint infected files are disallowed for download
  {
    controlId: '7.3.1', controlTitle: 'SharePoint infected files are disallowed for download',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'disallowInfectedFileDownload',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 7.3.2 — OneDrive sync restricted for unmanaged devices
  {
    controlId: '7.3.2', controlTitle: 'OneDrive sync restricted for unmanaged devices',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: 'spoTenant', property: 'isUnmanagedSyncClientForTenantRestricted',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // 8.1.1 — External file sharing in Teams limited to approved storage
  {
    controlId: '8.1.1', controlTitle: 'External file sharing in Teams limited to approved storage',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsClientConfiguration', property: 'allowDropBox',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.1.2 — Users can't send emails to a channel email address
  {
    controlId: '8.1.2', controlTitle: "Users can't send emails to a channel email address",
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsClientConfiguration', property: 'allowEmailIntoChannel',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.2.1 — External domains are restricted in Teams
  {
    controlId: '8.2.1', controlTitle: 'External domains are restricted in Teams',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'teams-external-access-restricted',
  },

  // 8.2.2 — Communication with unmanaged Teams users is disabled
  {
    controlId: '8.2.2', controlTitle: 'Communication with unmanaged Teams users is disabled',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'teams-unmanaged-access-disabled',
  },

  // 8.2.3 — External Teams users cannot initiate conversations
  {
    controlId: '8.2.3', controlTitle: 'External Teams users cannot initiate conversations',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'teams-unmanaged-inbound-disabled',
  },

  // 8.2.4 — Cannot communicate with trial Teams tenants
  {
    controlId: '8.2.4', controlTitle: 'Cannot communicate with trial Teams tenants',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsFederationConfiguration', property: 'externalAccessWithTrialTenants',
    operator: 'eq' as Operator, expectedValue: 'Blocked', assertionLogic: "ALL",
  },

  // 8.4.1 — App permission policies are configured
  {
    controlId: '8.4.1', controlTitle: 'App permission policies are configured',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: "", property: "",
    operator: "manual" as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // 8.5.1 — Anonymous users can't join a meeting
  {
    controlId: '8.5.1', controlTitle: "Anonymous users can't join a meeting",
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'allowAnonymousUsersToJoinMeeting',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.5.2 — Anonymous users and dial-in callers can't start a meeting
  {
    controlId: '8.5.2', controlTitle: "Anonymous users and dial-in callers can't start a meeting",
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'allowAnonymousUsersToStartMeeting',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.5.3 — Only people in my org can bypass the lobby
  {
    controlId: '8.5.3', controlTitle: 'Only people in my org can bypass the lobby',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'autoAdmittedUsers',
    operator: 'in' as Operator, expectedValue: ['OrganizerOnly', 'EveryoneInCompanyExcludingGuests', 'InvitedUsers', 'EveryoneInCompany'], assertionLogic: "ALL",
  },

  // 8.5.4 — Users dialing in can't bypass the lobby
  {
    controlId: '8.5.4', controlTitle: "Users dialing in can't bypass the lobby",
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'allowPSTNUsersToBypassLobby',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.5.5 — Meeting chat does not allow anonymous users
  {
    controlId: '8.5.5', controlTitle: 'Meeting chat does not allow anonymous users',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'meetingChatEnabledType',
    operator: 'in' as Operator, expectedValue: ['EnabledExceptAnonymous', 'EnabledInMeetingOnlyForAllExceptAnonymous', 'Disabled'], assertionLogic: "ALL",
  },

  // 8.5.6 — Only organizers and co-organizers can present
  {
    controlId: '8.5.6', controlTitle: 'Only organizers and co-organizers can present',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'designatedPresenterRoleMode',
    operator: 'eq' as Operator, expectedValue: 'OrganizerOnlyUserOverride', assertionLogic: "ALL",
  },

  // 8.5.7 — External participants can't give or request control
  {
    controlId: '8.5.7', controlTitle: "External participants can't give or request control",
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'allowExternalParticipantGiveRequestControl',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.5.8 — External meeting chat is off
  {
    controlId: '8.5.8', controlTitle: 'External meeting chat is off',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'allowExternalNonTrustedMeetingChat',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.5.9 — Meeting recording is off by default
  {
    controlId: '8.5.9', controlTitle: 'Meeting recording is off by default',
    frameworkSlug: "cis-m365-3.0", level: 'L2', required: false,
    source: 'teamsMeetingPolicy', property: 'allowCloudRecording',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // 8.6.1 — Users can report security concerns in Teams
  {
    controlId: '8.6.1', controlTitle: 'Users can report security concerns in Teams',
    frameworkSlug: "cis-m365-3.0", level: 'L1', required: true,
    source: '', property: "",
    operator: "eq" as Operator, expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'teams-security-reporting-enabled',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SCUBAGEAR FRAMEWORK (scubagear-m365-1.5)
  //
  // Each entry below maps a ScubaGear control to the same evidence sources
  // already collected by Watchtower. Zero additional data collection needed.
  //
  // Classification field: "SHALL" | "SHALL NOT" | "SHOULD" | "SHOULD NOT"
  // Note: ScubaGear max global admins = 8 (vs CIS 3.0 max = 4)
  //       ScubaGear DKIM = SHOULD (vs CIS = SHALL)
  //       ScubaGear MS.AAD.3.2 is v2 (updated from v1)
  // ══════════════════════════════════════════════════════════════════════════

  // ── MS.AAD ────────────────────────────────────────────────────────────────

  // MS.AAD.1.1v1 — Legacy authentication blocked via CA policy
  {
    controlId: 'MS.AAD.1.1v1', controlTitle: 'Legacy authentication SHALL be blocked',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'caPolicies', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'blockLegacyAuth',
  },

  // MS.AAD.2.1v1 — Block high risk users
  {
    controlId: 'MS.AAD.2.1v1', controlTitle: 'Users detected as high risk SHALL be blocked',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'caPolicies', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'blockHighRiskUsers',
  },

  // MS.AAD.2.3v1 — Block high risk sign-ins
  {
    controlId: 'MS.AAD.2.3v1', controlTitle: 'Sign-ins detected as high risk SHALL be blocked',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'caPolicies', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'blockHighRiskSignIns',
  },

  // MS.AAD.3.2v2 — MFA enforced for all users (v2 — note version change from v1)
  {
    controlId: 'MS.AAD.3.2v2', controlTitle: 'MFA SHALL be enforced for all users',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'caPolicies', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'requireMFAAllUsers',
  },

  // MS.AAD.3.3v2 — Authenticator number matching + context info
  {
    controlId: 'MS.AAD.3.3v2', controlTitle: 'Microsoft Authenticator SHALL show login context and require number matching',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'authMethodConfigurations', property: 'featureSettings.numberMatchingRequiredState.state',
    operator: 'eq' as Operator, expectedValue: 'enabled', assertionLogic: "ALL",
  },

  // MS.AAD.3.4v1 — Auth methods migration complete
  {
    controlId: 'MS.AAD.3.4v1', controlTitle: 'Authentication Methods migration SHALL be set to Migration Complete',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'authMethodConfigurations', property: 'policyMigrationState',
    operator: 'eq' as Operator, expectedValue: 'migrationComplete', assertionLogic: "ALL",
  },

  // MS.AAD.3.6v1 — Phishing-resistant MFA for privileged roles
  {
    controlId: 'MS.AAD.3.6v1', controlTitle: 'Phishing-resistant MFA SHALL be required for highly privileged roles',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'caPolicies', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'phishingResistantMFAAdmins',
  },

  // MS.AAD.5.1v1 — Only admins register apps
  {
    controlId: 'MS.AAD.5.1v1', controlTitle: 'Only administrators SHALL be allowed to register applications',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'authorizationPolicy', property: 'defaultUserRolePermissions.allowedToCreateApps',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.AAD.5.2v1 — User consent restricted
  {
    controlId: 'MS.AAD.5.2v1', controlTitle: 'User consent to applications SHALL be restricted',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'authorizationPolicy', property: 'permissionGrantPolicyIdsAssignedToDefaultUserRole',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'userConsentRestricted',
  },

  // MS.AAD.5.3v1 — Admin consent workflow
  {
    controlId: 'MS.AAD.5.3v1', controlTitle: 'An admin consent workflow SHALL be configured',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'adminConsentRequestPolicy', property: 'isEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // MS.AAD.6.1v1 — Passwords don't expire
  {
    controlId: 'MS.AAD.6.1v1', controlTitle: 'User passwords SHALL NOT expire',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL NOT', required: true,
    source: 'passwordProtectionSettings', property: 'passwordNeverExpires',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // MS.AAD.7.1v1 — 2-8 global admins (ScubaGear max=8, CIS max=4)
  {
    controlId: 'MS.AAD.7.1v1', controlTitle: 'Between two and eight users SHALL hold the Global Administrator role',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'privilegedUsers', property: '',
    operator: 'count' as Operator, expectedValue: {"min": 2, "max": 8}, assertionLogic: "ALL",
    sourceFilter: {"roleTemplateId": "62e90394-69f5-4237-9190-012177145e10"},
  },

  // MS.AAD.7.3v1 — Admins cloud-only
  {
    controlId: 'MS.AAD.7.3v1', controlTitle: 'Privileged users SHALL be provisioned cloud-only accounts',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'privilegedUsers', property: 'principal.onPremisesSyncEnabled',
    operator: 'neq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // MS.AAD.7.4v1 — No permanent active highly privileged assignments
  {
    controlId: 'MS.AAD.7.4v1', controlTitle: 'Permanent active role assignments SHALL NOT be allowed for highly privileged roles',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL NOT', required: true,
    source: 'roleManagementPolicyAssignments', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'noPermanentActiveAssignment',
  },

  // MS.AAD.7.6v1 — Global Admin activation requires approval
  {
    controlId: 'MS.AAD.7.6v1', controlTitle: 'Activation of the Global Administrator role SHALL require approval',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'roleManagementPolicyAssignments', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'globalAdminApprovalRequired',
  },

  // MS.AAD.7.7v1 — Assignment alerts for highly privileged roles
  {
    controlId: 'MS.AAD.7.7v1', controlTitle: 'Highly privileged role assignments SHALL trigger an alert',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'roleManagementPolicyAssignments', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'assignmentAlertConfigured',
  },

  // MS.AAD.7.8v1 — Global Admin activation alert
  {
    controlId: 'MS.AAD.7.8v1', controlTitle: 'Global Administrator activation SHALL trigger an alert',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'roleManagementPolicyAssignments', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'globalAdminActivationAlert',
  },

  // MS.AAD.8.1v1 — Guest user directory access limited
  {
    controlId: 'MS.AAD.8.1v1', controlTitle: 'Guest users SHOULD have limited access to Entra ID directory',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD', required: false,
    source: 'authorizationPolicy', property: 'guestUserRoleId',
    operator: 'in' as Operator,
    expectedValue: ["10dae51f-b6af-4016-8d66-8c2a99b929b3", "2af84b1e-32c8-42b7-82bc-daa82404023b"],
    assertionLogic: "ALL",
  },

  // MS.AAD.8.2v1 — Guest invitations restricted
  {
    controlId: 'MS.AAD.8.2v1', controlTitle: 'Only users with the Guest Inviter role SHOULD be able to invite guests',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD', required: false,
    source: 'authorizationPolicy', property: 'allowInvitesFrom',
    operator: 'in' as Operator,
    expectedValue: ["adminsAndGuestInviters", "adminsGuestInvitersAndAllMembers", "none"],
    assertionLogic: "ALL",
  },

  // ── MS.EXO ────────────────────────────────────────────────────────────────

  // MS.EXO.1.1v2 — Auto forwarding to external domains disabled
  {
    controlId: 'MS.EXO.1.1v2', controlTitle: 'Automatic forwarding to external domains SHALL be disabled',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'hostedOutboundSpamFilterPolicies', property: 'autoForwardingMode',
    operator: 'in' as Operator, expectedValue: ['Automatic', 'Off'], assertionLogic: "ALL",
  },

  // MS.EXO.2.2v3 — SPF published (v3 — note version change)
  {
    controlId: 'MS.EXO.2.2v3', controlTitle: 'An SPF policy SHALL be published for each domain',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'domainDnsRecords', property: 'spf',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'spfEnabled',
  },

  // MS.EXO.3.1v1 — DKIM enabled (ScubaGear = SHOULD, CIS = SHALL)
  // Converted to declarative: each domain must have at least one DKIM record
  {
    controlId: 'MS.EXO.3.1v1', controlTitle: 'DKIM SHOULD be enabled for all domains',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD', required: false,
    source: 'domainDnsRecords', property: 'dkim',
    operator: 'notEmpty' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // MS.EXO.4.1v1 — DMARC published
  {
    controlId: 'MS.EXO.4.1v1', controlTitle: 'A DMARC policy SHALL be published for every second-level domain',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'domainDnsRecords', property: 'dmarc',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'dmarcPublished',
  },

  // MS.EXO.4.2v1 — DMARC p=reject
  {
    controlId: 'MS.EXO.4.2v1', controlTitle: 'The DMARC message rejection option SHALL be p=reject',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'domainDnsRecords', property: 'dmarc',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'dmarcReject',
  },

  // MS.EXO.4.3v1 — DMARC reports to CISA
  {
    controlId: 'MS.EXO.4.3v1', controlTitle: 'DMARC SHALL include reports@dmarc.cyber.dhs.gov as aggregate recipient',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'domainDnsRecords', property: 'dmarc',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'dmarcCISAContact',
  },

  // MS.EXO.5.1v1 — SMTP AUTH disabled
  {
    controlId: 'MS.EXO.5.1v1', controlTitle: 'SMTP AUTH SHALL be disabled',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'transportConfig', property: 'smtpClientAuthenticationDisabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // MS.EXO.6.2v1 — Calendar details not shared with all domains
  {
    controlId: 'MS.EXO.6.2v1', controlTitle: 'Calendar details SHALL NOT be shared with all domains',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL NOT', required: true,
    source: 'sharingPolicies', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'calendarSharingRestricted',
  },

  // MS.EXO.7.1v1 — External sender warnings
  {
    controlId: 'MS.EXO.7.1v1', controlTitle: 'External sender warnings SHALL be implemented',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'externalInOutlook', property: 'enabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // MS.EXO.13.1v1 — Mailbox auditing enabled
  {
    controlId: 'MS.EXO.13.1v1', controlTitle: 'Mailbox auditing SHALL be enabled',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'userMailboxes', property: 'auditEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // ── MS.DEFENDER ───────────────────────────────────────────────────────────

  // MS.DEFENDER.1.1v1 — Preset security policies enabled
  {
    controlId: 'MS.DEFENDER.1.1v1', controlTitle: 'Standard and strict preset security policies SHALL be enabled',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'atpProtectionPolicyRules', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'presetPoliciesEnabled',
  },

  // MS.DEFENDER.6.1v1 — Unified audit logging enabled
  {
    controlId: 'MS.DEFENDER.6.1v1', controlTitle: 'Unified Audit logging SHALL be enabled',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'adminAuditLogConfig', property: 'unifiedAuditLogIngestionEnabled',
    operator: 'eq' as Operator, expectedValue: true, assertionLogic: "ALL",
  },

  // ── MS.SHAREPOINT ─────────────────────────────────────────────────────────

  // MS.SHAREPOINT.1.1v1 — External sharing limited
  {
    controlId: 'MS.SHAREPOINT.1.1v1', controlTitle: 'External sharing for SharePoint SHALL be limited to Existing guests or less',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'spoTenant', property: 'sharingCapability',
    operator: 'in' as Operator, expectedValue: [0, 3], assertionLogic: "ALL",
    // 0 = Disabled, 3 = ExistingExternalUserSharingOnly
  },

  // MS.SHAREPOINT.1.3v1 — Sharing restricted to approved domains
  {
    controlId: 'MS.SHAREPOINT.1.3v1', controlTitle: 'External sharing SHALL be restricted to approved external domains',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'spoTenant', property: 'sharingDomainRestrictionMode',
    operator: 'in' as Operator, expectedValue: [1, 2], assertionLogic: "ALL",
    // 1 = AllowList, 2 = BlockList
  },

  // MS.SHAREPOINT.2.1v1 — Default link scope = specific people
  {
    controlId: 'MS.SHAREPOINT.2.1v1', controlTitle: 'Default sharing scope SHALL be set to Specific people only',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'spoTenant', property: 'defaultSharingLinkType',
    operator: 'eq' as Operator, expectedValue: 1, assertionLogic: "ALL",
    // 1 = Direct (specific people)
  },

  // MS.SHAREPOINT.2.2v1 — Default link permission = view
  {
    controlId: 'MS.SHAREPOINT.2.2v1', controlTitle: 'Default sharing permissions SHALL be set to view only',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'spoTenant', property: 'defaultLinkPermission',
    operator: 'eq' as Operator, expectedValue: 1, assertionLogic: "ALL",
    // 1 = View
  },

  // MS.SHAREPOINT.3.1v1 — Anyone links expire in ≤30 days
  {
    controlId: 'MS.SHAREPOINT.3.1v1', controlTitle: 'Expiration days for Anyone links SHALL be set to 30 days or less',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'spoTenant', property: 'requireAnonymousLinksExpireInDays',
    operator: 'lte' as Operator, expectedValue: 30, assertionLogic: "ALL",
  },

  // ── MS.TEAMS ──────────────────────────────────────────────────────────────

  // MS.TEAMS.1.1v1 — External participants cannot request screen control
  {
    controlId: 'MS.TEAMS.1.1v1', controlTitle: 'External participants SHOULD NOT be enabled to request control of shared desktops',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD NOT', required: false,
    source: 'teamsMeetingPolicy', property: 'allowExternalParticipantGiveRequestControl',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.TEAMS.1.2v2 — Anonymous users cannot start meetings
  {
    controlId: 'MS.TEAMS.1.2v2', controlTitle: 'Anonymous users SHALL NOT be enabled to start meetings',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL NOT', required: true,
    source: 'teamsMeetingPolicy', property: 'allowAnonymousUsersToStartMeeting',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.TEAMS.1.3v1 — Anonymous users not admitted automatically
  {
    controlId: 'MS.TEAMS.1.3v1', controlTitle: 'Anonymous users and dial-in callers SHOULD NOT be admitted automatically',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD NOT', required: false,
    source: 'teamsMeetingPolicy', property: 'autoAdmittedUsers',
    operator: 'neq' as Operator, expectedValue: 'Everyone', assertionLogic: "ALL",
  },

  // MS.TEAMS.1.5v1 — Dial-in users cannot bypass lobby
  {
    controlId: 'MS.TEAMS.1.5v1', controlTitle: 'Dial-in users SHOULD NOT be enabled to bypass the lobby',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD NOT', required: false,
    source: 'teamsMeetingPolicy', property: 'allowPSTNUsersToBypassLobby',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.TEAMS.1.6v1 — Meeting recording disabled
  {
    controlId: 'MS.TEAMS.1.6v1', controlTitle: 'Meeting recording SHOULD be disabled',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD', required: false,
    source: 'teamsMeetingPolicy', property: 'allowCloudRecording',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.TEAMS.1.7v2 — Live event recording not set to Always
  {
    controlId: 'MS.TEAMS.1.7v2', controlTitle: 'Record an event SHOULD NOT be set to Always record',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD NOT', required: false,
    source: 'teamsMeetingPolicy', property: 'liveStreamingMode',
    operator: 'neq' as Operator, expectedValue: 'AlwaysRecord', assertionLogic: "ALL",
  },

  // MS.TEAMS.2.1v2 — External access per-domain only
  {
    controlId: 'MS.TEAMS.2.1v2', controlTitle: 'External access for users SHALL only be enabled on a per-domain basis',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'teamsFederationConfiguration', property: '',
    operator: 'custom', expectedValue: null, assertionLogic: "ALL",
    evaluatorSlug: 'externalAccessPerDomain',
  },

  // MS.TEAMS.2.2v2 — Unmanaged users cannot initiate contact
  {
    controlId: 'MS.TEAMS.2.2v2', controlTitle: 'Unmanaged users SHALL NOT be enabled to initiate contact with internal users',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL NOT', required: true,
    source: 'teamsClientConfiguration', property: 'allowTeamsConsumerInbound',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.TEAMS.2.3v2 — Internal users cannot initiate contact with unmanaged
  {
    controlId: 'MS.TEAMS.2.3v2', controlTitle: 'Internal users SHOULD NOT be enabled to initiate contact with unmanaged users',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD NOT', required: false,
    source: 'teamsClientConfiguration', property: 'allowTeamsConsumer',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.TEAMS.4.1v1 — Teams email integration disabled
  {
    controlId: 'MS.TEAMS.4.1v1', controlTitle: 'Teams email integration SHALL be disabled',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHALL', required: true,
    source: 'teamsClientConfiguration', property: 'allowEmailIntoChannel',
    operator: 'eq' as Operator, expectedValue: false, assertionLogic: "ALL",
  },

  // MS.TEAMS.5.1v2 — Only approved Microsoft apps (manual)
  {
    controlId: 'MS.TEAMS.5.1v2', controlTitle: 'Agencies SHOULD only allow installation of approved Microsoft apps',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD', required: false,
    source: '', property: '',
    operator: 'manual' as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // MS.TEAMS.5.2v2 — Only approved third-party apps (manual)
  {
    controlId: 'MS.TEAMS.5.2v2', controlTitle: 'Agencies SHOULD only allow installation of approved third-party apps',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD', required: false,
    source: '', property: '',
    operator: 'manual' as Operator, expectedValue: null, assertionLogic: "ALL",
  },

  // MS.TEAMS.5.3v2 — Only approved custom apps (manual)
  {
    controlId: 'MS.TEAMS.5.3v2', controlTitle: 'Agencies SHOULD only allow installation of approved custom apps',
    frameworkSlug: "scubagear-m365-1.5", level: 'SHOULD', required: false,
    source: '', property: '',
    operator: 'manual' as Operator, expectedValue: null, assertionLogic: "ALL",
  },

];


export { MOCKED_CONTROL_ASSERTIONS };
