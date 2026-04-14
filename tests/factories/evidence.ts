/**
 * tests/factories/evidence.ts
 *
 * Factory helpers for building mock EvidenceSnapshot objects used in
 * evaluator tests.  Each builder produces a well-typed default value
 * for a common evidence source key so tests only need to override the
 * fields they care about.
 *
 * Usage:
 *   import { createSnapshot, builders } from "../factories/evidence";
 *
 *   const snap = createSnapshot({
 *     domainDnsRecords: [builders.domainDnsRecord({ domain: "acme.com" })],
 *   });
 *   const result = evaluate(snap);
 */

import type { EvidenceSnapshot } from "../../packages/engine/evaluators/types";

// ---------------------------------------------------------------------------
// Core snapshot constructors
// ---------------------------------------------------------------------------

/**
 * Create an EvidenceSnapshot with the given data record.
 * Pass any combination of evidence-source keys.
 */
export function createSnapshot(
  data?: Record<string, unknown>,
): EvidenceSnapshot {
  return { data: data ?? {} };
}

/**
 * Create an EvidenceSnapshot with no data at all (`data` is `undefined`).
 * Useful for verifying evaluators handle missing evidence gracefully.
 */
export function createEmptySnapshot(): EvidenceSnapshot {
  return {};
}

// ---------------------------------------------------------------------------
// Builder helpers — one per common evidence source shape
// ---------------------------------------------------------------------------

/**
 * domainDnsRecords entry — DNS evidence for a single domain.
 */
export function domainDnsRecord(
  overrides: Partial<{
    domain: string;
    dmarc: string[];
    spf: string[];
  }> = {},
) {
  return {
    domain: "example.com",
    dmarc: [] as string[],
    spf: [] as string[],
    ...overrides,
  };
}

/**
 * timeoutPolicies entry — Entra ID activity-based timeout policy.
 */
export function timeoutPolicy(
  overrides: Partial<{
    definition: string[];
    displayName: string;
  }> = {},
) {
  return {
    definition: [] as string[],
    displayName: "Default",
    ...overrides,
  };
}

/**
 * praRoleManagementPolicyRules entry — PIM role-management policy rule.
 */
export function praRoleManagementPolicyRule(
  overrides: Partial<{
    "@odata.type": string;
    setting: {
      isApprovalRequired: boolean;
      approvalStages: unknown[];
    };
  }> = {},
) {
  return {
    "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule",
    setting: {
      isApprovalRequired: false,
      approvalStages: [],
    },
    ...overrides,
  };
}

/**
 * accessReviews entry — Entra ID access review definition.
 */
export function accessReview(
  overrides: Partial<{
    scope: {
      query: string;
      principalScopes: unknown[];
    };
    settings: Record<string, unknown>;
    status: string;
  }> = {},
) {
  return {
    scope: { query: "", principalScopes: [] },
    settings: {},
    status: "NotStarted",
    ...overrides,
  };
}

/**
 * privilegedUsers entry — permanently assigned privileged role member.
 */
export function privilegedUser(
  overrides: Partial<{
    roleTemplateId: string;
    principalId: string;
    principal: {
      userPrincipalName: string;
      onPremisesSyncEnabled?: boolean;
    };
  }> = {},
) {
  return {
    roleTemplateId: "00000000-0000-0000-0000-000000000000",
    principalId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    principal: {
      userPrincipalName: "admin@example.com",
    },
    ...overrides,
  };
}

/**
 * pimEligibleAssignments entry — PIM-eligible role assignment.
 */
export function pimEligibleAssignment(
  overrides: Partial<{
    roleDefinitionId: string;
    principalId: string;
  }> = {},
) {
  return {
    roleDefinitionId: "00000000-0000-0000-0000-000000000000",
    principalId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ...overrides,
  };
}

/**
 * passwordProtectionSettings entry — Entra ID authentication method policy.
 */
export function passwordProtectionSetting(
  overrides: Partial<{
    templateId: string;
    values: { name: string; value: string }[];
  }> = {},
) {
  return {
    templateId: "00000000-0000-0000-0000-000000000000",
    values: [] as { name: string; value: string }[],
    ...overrides,
  };
}

/**
 * b2bManagementPolicy entry — B2B collaboration / invitation policy.
 */
export function b2bPolicy(
  overrides: Partial<{
    type: string;
    definition: string[];
  }> = {},
) {
  return {
    type: "B2BManagementPolicy",
    definition: [] as string[],
    ...overrides,
  };
}

/**
 * groups entry — Entra ID / Microsoft 365 group.
 */
export function group(
  overrides: Partial<{
    groupTypes: string[];
    membershipRule: string;
    membershipRuleProcessingState: string;
    visibility: string;
  }> = {},
) {
  return {
    groupTypes: [] as string[],
    membershipRule: undefined as string | undefined,
    membershipRuleProcessingState: undefined as string | undefined,
    visibility: undefined as string | undefined,
    ...overrides,
  };
}

/**
 * enrollmentConfigurations entry — Intune device-enrollment restriction.
 */
export function enrollmentConfiguration(
  overrides: Partial<{
    id: string;
    priority: number;
    windowsRestriction: Record<string, unknown>;
    iosRestriction: Record<string, unknown>;
    androidRestriction: Record<string, unknown>;
    androidForWorkRestriction: Record<string, unknown>;
    macOSRestriction: Record<string, unknown>;
  }> = {},
) {
  return {
    id: "default",
    priority: 0,
    windowsRestriction: undefined as Record<string, unknown> | undefined,
    iosRestriction: undefined as Record<string, unknown> | undefined,
    androidRestriction: undefined as Record<string, unknown> | undefined,
    androidForWorkRestriction: undefined as Record<string, unknown> | undefined,
    macOSRestriction: undefined as Record<string, unknown> | undefined,
    ...overrides,
  };
}

/**
 * teamsMessagingPolicy entry — Teams messaging policy.
 */
export function teamsMessagingPolicy(
  overrides: Partial<{
    allowSecurityEndUserReporting: boolean;
  }> = {},
) {
  return {
    allowSecurityEndUserReporting: false,
    ...overrides,
  };
}

/**
 * threatSubmissionPolicy entry — Defender threat-submission policy.
 */
export function threatSubmissionPolicy(
  overrides: Record<string, unknown> = {},
) {
  return {
    isReportToCustomizedEmailAddressEnabled: false,
    customizedReportRecipientEmailAddress: undefined as string | undefined,
    ...overrides,
  };
}

/**
 * teamsExternalAccessPolicy entry — Teams external access policy.
 */
export function teamsExternalAccessPolicy(
  overrides: Record<string, unknown> = {},
) {
  return {
    allowFederatedUsers: true,
    enableFederationAccess: true,
    ...overrides,
  };
}

/**
 * teamsFederationConfiguration entry — Teams federation configuration.
 */
export function teamsFederationConfiguration(
  overrides: Record<string, unknown> = {},
) {
  return {
    allowedDomains: [] as string[],
    ...overrides,
  };
}

/**
 * transportRules entry — Exchange Online transport / mail-flow rule.
 */
export function transportRule(
  overrides: Partial<{
    name: string;
    setScl: number;
    senderDomainIs: string[];
    redirectMessageTo: string[];
  }> = {},
) {
  return {
    name: "Default Rule",
    setScl: undefined as number | undefined,
    senderDomainIs: undefined as string[] | undefined,
    redirectMessageTo: undefined as string[] | undefined,
    ...overrides,
  };
}

/**
 * sharingPolicies entry — Exchange Online / SharePoint sharing policy.
 */
export function sharingPolicy(
  overrides: Partial<{
    name: string;
    identity: string;
    domains: string[];
  }> = {},
) {
  return {
    name: "Default Sharing Policy",
    identity: "Default Sharing Policy",
    domains: [] as string[],
    ...overrides,
  };
}

/**
 * authorizationPolicy entry — Entra ID authorization policy.
 */
export function authorizationPolicy(
  overrides: Partial<{
    permissionGrantPolicyIdsAssignedToDefaultUserRole: string[];
  }> = {},
) {
  return {
    permissionGrantPolicyIdsAssignedToDefaultUserRole: [] as string[],
    ...overrides,
  };
}

/**
 * atpProtectionPolicyRules entry — Defender ATP preset policy rule.
 */
export function atpProtectionPolicyRule(
  overrides: Partial<{
    identity: string;
  }> = {},
) {
  return {
    identity: "Standard Preset Security Policy",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Namespace export for convenient dot-access in tests
// ---------------------------------------------------------------------------

/**
 * Grouped builders for use as `builders.domainDnsRecord(...)` etc.
 *
 * @example
 *   import { createSnapshot, builders } from "../factories/evidence";
 *
 *   const snap = createSnapshot({
 *     domainDnsRecords: [
 *       builders.domainDnsRecord({ domain: "acme.com", dmarc: ["v=DMARC1; p=reject"] }),
 *     ],
 *     privilegedUsers: [
 *       builders.privilegedUser({ roleTemplateId: GLOBAL_ADMIN_ROLE_ID }),
 *     ],
 *   });
 */
export const builders = {
  domainDnsRecord,
  timeoutPolicy,
  praRoleManagementPolicyRule,
  accessReview,
  privilegedUser,
  pimEligibleAssignment,
  passwordProtectionSetting,
  b2bPolicy,
  group,
  enrollmentConfiguration,
  teamsMessagingPolicy,
  threatSubmissionPolicy,
  teamsExternalAccessPolicy,
  teamsFederationConfiguration,
  transportRule,
  sharingPolicy,
  authorizationPolicy,
  atpProtectionPolicyRule,
} as const;
