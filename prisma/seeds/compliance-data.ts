// =============================================================================
// Watchtower — Compliance data seeder (checks, frameworks, controls)
// =============================================================================
//
// Seeds the global compliance catalog with representative CIS Microsoft 365
// checks and three compliance frameworks (CIS M365 v6.0.1, ScubaGear M365
// v1.5, and NIST CSF v2.0). ScubaGear controls are cross-mapped to the same
// checks where baselines overlap with CIS recommendations.
//
// This seeder is idempotent — safe to run repeatedly. It uses upsert
// semantics for all records.
//
// Checks and frameworks are global (no workspaceId). Controls link checks
// to frameworks via checkSlug, so they survive check version bumps.
//
// =============================================================================

import type { PrismaClient } from "@prisma/client";

// =============================================================================
// CHECK CATALOG
// =============================================================================
// Representative CIS Microsoft 365 Foundations Benchmark checks covering
// identity, data management, and Exchange Online security.

type CheckSeed = {
  id: string;
  slug: string;
  version: number;
  title: string;
  description: string;
  rationale: string;
  remediation: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  severityRank: number;
  source: "BUILTIN";
  graphScopes: string[];
  dataSource: string | null;
  property: string | null;
  product: string;
  connectors: string[];
  allowedValues: unknown;
  allowedOperators: string[];
};

const SEVERITY_RANK: Record<string, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function getSeverityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 0;
}

export const CHECKS: readonly CheckSeed[] = [
  {
    id: "chk-cis-mfa-admins-001",
    slug: "wt.entra.ca.require_mfa_admins",
    version: 1,
    title: "Ensure multifactor authentication is enabled for all users in administrative roles",
    description: "Verify that MFA is required for all administrative role holders via Conditional Access policies.",
    rationale: "Administrative accounts are high-value targets. Requiring MFA significantly reduces the risk of account compromise.",
    remediation: "Create a Conditional Access policy targeting the 'All administrators' directory role with a Grant control requiring multifactor authentication.",
    severity: "CRITICAL",
    severityRank: getSeverityRank("CRITICAL"),
    source: "BUILTIN",
    graphScopes: ["Policy.Read.All", "Directory.Read.All"],
    dataSource: "conditionalAccessPolicies",
    property: "grantControls.builtInControls",
    product: "Entra ID",
    connectors: ["microsoft-graph"],
    allowedValues: [{ value: "mfa", label: "MFA Required" }],
    allowedOperators: ["contains"],
  },
  {
    id: "chk-cis-mfa-users-002",
    slug: "wt.entra.ca.require_mfa_users",
    version: 1,
    title: "Ensure multifactor authentication is enabled for all users",
    description: "Verify that MFA is enforced for all users, not just administrators, via Conditional Access policies.",
    rationale: "All user accounts can be targets for phishing and credential theft. Organization-wide MFA greatly reduces breach risk.",
    remediation: "Create a Conditional Access policy targeting 'All users' with a Grant control requiring multifactor authentication.",
    severity: "HIGH",
    severityRank: getSeverityRank("HIGH"),
    source: "BUILTIN",
    graphScopes: ["Policy.Read.All"],
    dataSource: "conditionalAccessPolicies",
    property: "grantControls.builtInControls",
    product: "Entra ID",
    connectors: ["microsoft-graph"],
    allowedValues: [{ value: "mfa", label: "MFA Required" }],
    allowedOperators: ["contains"],
  },
  {
    id: "chk-cis-legacy-auth-003",
    slug: "wt.entra.ca.block_legacy_auth",
    version: 1,
    title: "Ensure that legacy authentication is blocked",
    description: "Verify that legacy authentication protocols (POP3, IMAP, SMTP, etc.) are blocked via Conditional Access.",
    rationale: "Legacy authentication protocols do not support MFA and are a primary attack vector for credential-based attacks.",
    remediation: "Create a Conditional Access policy that blocks access from legacy authentication clients for all users.",
    severity: "HIGH",
    severityRank: getSeverityRank("HIGH"),
    source: "BUILTIN",
    graphScopes: ["Policy.Read.All"],
    dataSource: "conditionalAccessPolicies",
    property: "conditions.clientAppTypes",
    product: "Entra ID",
    connectors: ["microsoft-graph"],
    allowedValues: null,
    allowedOperators: ["eq"],
  },
  {
    id: "chk-cis-spo-sharing-004",
    slug: "wt.spo.sharing_capability",
    version: 1,
    title: "Ensure SharePoint external sharing is managed",
    description: "Verify that SharePoint Online external sharing is restricted to known guests or disabled entirely.",
    rationale: "Unrestricted external sharing can lead to data leakage. Limiting sharing to existing guests or internal only reduces exposure.",
    remediation: "In the SharePoint admin center, set the external sharing level to 'Existing guests' or 'Only people in your organization'.",
    severity: "MEDIUM",
    severityRank: getSeverityRank("MEDIUM"),
    source: "BUILTIN",
    graphScopes: ["SharePointTenantSettings.Read.All"],
    dataSource: "spoTenant",
    property: "sharingCapability",
    product: "SharePoint Online",
    connectors: ["microsoft-graph"],
    allowedValues: [
      { value: 0, label: "Disabled" },
      { value: 1, label: "ExternalUserSharingOnly" },
    ],
    allowedOperators: ["eq", "in"],
  },
  {
    id: "chk-cis-exo-auto-forward-005",
    slug: "wt.exo.disable_auto_forwarding",
    version: 1,
    title: "Ensure automatic email forwarding to external recipients is disabled",
    description: "Verify that outbound transport rules block automatic forwarding of emails to external domains.",
    rationale: "Automatic forwarding can be exploited to exfiltrate data. Disabling it prevents compromised accounts from silently forwarding email.",
    remediation: "Create an Exchange Online transport rule that blocks auto-forwarded messages to external recipients.",
    severity: "HIGH",
    severityRank: getSeverityRank("HIGH"),
    source: "BUILTIN",
    graphScopes: ["Exchange.ManageAsApp"],
    dataSource: "exoTransportRules",
    property: "autoForwardEnabled",
    product: "Exchange Online",
    connectors: ["exchange-online"],
    allowedValues: [{ value: false, label: "Disabled" }],
    allowedOperators: ["eq"],
  },
  {
    id: "chk-cis-audit-log-006",
    slug: "wt.m365.unified_audit_log",
    version: 1,
    title: "Ensure Microsoft 365 audit log search is enabled",
    description: "Verify that unified audit log search is turned on in the Microsoft 365 compliance center.",
    rationale: "The unified audit log is essential for security investigations and compliance evidence. Disabling it creates blind spots.",
    remediation: "Enable unified audit log search in the Microsoft 365 compliance center under Audit settings.",
    severity: "HIGH",
    severityRank: getSeverityRank("HIGH"),
    source: "BUILTIN",
    graphScopes: ["AuditLogsQuery.Read.All"],
    dataSource: "m365AuditConfig",
    property: "unifiedAuditLogEnabled",
    product: "Microsoft 365",
    connectors: ["microsoft-graph"],
    allowedValues: [{ value: true, label: "Enabled" }],
    allowedOperators: ["eq"],
  },
  {
    id: "chk-cis-global-admin-007",
    slug: "wt.entra.limit_global_admins",
    version: 1,
    title: "Ensure fewer than 5 users have Global Administrator role",
    description: "Verify that the number of Global Administrator role holders is between 2 and 4.",
    rationale: "Having too many global admins increases the attack surface. Having fewer than 2 creates a single point of failure.",
    remediation: "Review and reduce Global Administrator role assignments. Use specific admin roles (Exchange Admin, SharePoint Admin) instead.",
    severity: "MEDIUM",
    severityRank: getSeverityRank("MEDIUM"),
    source: "BUILTIN",
    graphScopes: ["Directory.Read.All", "RoleManagement.Read.Directory"],
    dataSource: "directoryRoleMembers",
    property: "globalAdminCount",
    product: "Entra ID",
    connectors: ["microsoft-graph"],
    allowedValues: null,
    allowedOperators: ["gte", "lte"],
  },
  {
    id: "chk-cis-password-policy-008",
    slug: "wt.entra.password_expiry_policy",
    version: 1,
    title: "Ensure password expiration policy is set to not expire",
    description: "Verify that password expiration is disabled (passwords do not expire), per NIST 800-63B guidance.",
    rationale: "NIST recommends against mandatory password rotation. Forced rotation leads to weaker passwords and predictable patterns.",
    remediation: "Set password expiration policy to 'Set passwords to never expire' in Microsoft 365 admin center.",
    severity: "LOW",
    severityRank: getSeverityRank("LOW"),
    source: "BUILTIN",
    graphScopes: ["Directory.Read.All"],
    dataSource: "domainPasswordPolicy",
    property: "passwordValidityPeriodInDays",
    product: "Entra ID",
    connectors: ["microsoft-graph"],
    allowedValues: [{ value: 2147483647, label: "Never expires" }],
    allowedOperators: ["eq"],
  },
  {
    id: "chk-cis-sspr-009",
    slug: "wt.entra.self_service_password_reset",
    version: 1,
    title: "Ensure self-service password reset is enabled for all users",
    description: "Verify that self-service password reset (SSPR) is enabled organization-wide.",
    rationale: "SSPR reduces helpdesk calls and allows users to securely reset passwords without admin intervention.",
    remediation: "Enable self-service password reset for 'All' users in Microsoft Entra ID > Password reset settings.",
    severity: "MEDIUM",
    severityRank: getSeverityRank("MEDIUM"),
    source: "BUILTIN",
    graphScopes: ["Policy.Read.All"],
    dataSource: "authenticationMethodsPolicy",
    property: "selfServicePasswordResetEnabled",
    product: "Entra ID",
    connectors: ["microsoft-graph"],
    allowedValues: [{ value: true, label: "Enabled" }],
    allowedOperators: ["eq"],
  },
  {
    id: "chk-cis-teams-ext-access-010",
    slug: "wt.teams.external_access_policy",
    version: 1,
    title: "Ensure external access is restricted in Microsoft Teams",
    description: "Verify that external access (federation) in Microsoft Teams is restricted to approved domains only.",
    rationale: "Unrestricted external access allows any external user to communicate with your users, increasing phishing risk.",
    remediation: "In the Teams admin center, configure external access to allow only specific trusted domains.",
    severity: "MEDIUM",
    severityRank: getSeverityRank("MEDIUM"),
    source: "BUILTIN",
    graphScopes: ["TeamSettings.ReadWrite.All"],
    dataSource: "teamsExternalAccessPolicy",
    property: "allowedDomains",
    product: "Microsoft Teams",
    connectors: ["microsoft-graph"],
    allowedValues: null,
    allowedOperators: ["eq"],
  },
] as const;

// =============================================================================
// FRAMEWORK CATALOG
// =============================================================================

type FrameworkSeed = {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  version: string;
  url: string | null;
};

export const FRAMEWORKS: readonly FrameworkSeed[] = [
  {
    id: "fw-cis-m365-v6.0.1",
    slug: "cis-m365-v6.0.1",
    name: "CIS Microsoft 365 Foundations Benchmark",
    publisher: "CIS",
    version: "6.0.1",
    url: "https://www.cisecurity.org/benchmark/microsoft_365",
  },
  {
    id: "fw-scubagear-m365-v1.5",
    slug: "scubagear-m365-v1.5",
    name: "ScubaGear M365 Security Baseline",
    publisher: "CISA",
    version: "1.5.0",
    url: "https://github.com/cisagov/ScubaGear",
  },
  {
    id: "fw-nist-csf-v2.0",
    slug: "nist-csf-v2.0",
    name: "NIST Cybersecurity Framework",
    publisher: "NIST",
    version: "2.0",
    url: "https://www.nist.gov/cyberframework",
  },
] as const;

// =============================================================================
// CONTROL MAPPINGS
// =============================================================================
// Maps checks to framework controls. A check can appear in multiple
// frameworks (e.g., MFA check maps to both CIS and NIST controls).

type ControlSeed = {
  checkSlug: string;
  checkId: string;
  frameworkId: string;
  controlId: string;
  controlTitle: string;
  classification: string | null;
  required: boolean;
  automated: boolean;
};

const CONTROLS: readonly ControlSeed[] = [
  // -- CIS M365 controls --
  {
    checkSlug: "wt.entra.ca.require_mfa_admins",
    checkId: "chk-cis-mfa-admins-001",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "1.1.1",
    controlTitle: "Ensure multifactor authentication is enabled for all users in administrative roles",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.ca.require_mfa_users",
    checkId: "chk-cis-mfa-users-002",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "1.1.2",
    controlTitle: "Ensure multifactor authentication is enabled for all users",
    classification: "L2",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.ca.block_legacy_auth",
    checkId: "chk-cis-legacy-auth-003",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "1.1.4",
    controlTitle: "Ensure legacy authentication is not allowed",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.spo.sharing_capability",
    checkId: "chk-cis-spo-sharing-004",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "3.1.1",
    controlTitle: "Ensure SharePoint external sharing is managed",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.exo.disable_auto_forwarding",
    checkId: "chk-cis-exo-auto-forward-005",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "4.2.1",
    controlTitle: "Ensure automatic forwarding is disabled",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.m365.unified_audit_log",
    checkId: "chk-cis-audit-log-006",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "5.1.1",
    controlTitle: "Ensure Microsoft 365 audit log search is enabled",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.limit_global_admins",
    checkId: "chk-cis-global-admin-007",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "1.1.3",
    controlTitle: "Ensure that between two and four global admins are designated",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.password_expiry_policy",
    checkId: "chk-cis-password-policy-008",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "1.3.1",
    controlTitle: "Ensure password expiration policy is set to not expire",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.self_service_password_reset",
    checkId: "chk-cis-sspr-009",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "1.3.2",
    controlTitle: "Ensure self-service password reset is enabled",
    classification: "L1",
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.teams.external_access_policy",
    checkId: "chk-cis-teams-ext-access-010",
    frameworkId: "fw-cis-m365-v6.0.1",
    controlId: "8.1.1",
    controlTitle: "Ensure external access is restricted in Microsoft Teams",
    classification: "L2",
    required: true,
    automated: true,
  },

  // -- ScubaGear M365 controls (cross-mapping CIS checks to CISA baselines) --
  {
    checkSlug: "wt.entra.ca.require_mfa_admins",
    checkId: "chk-cis-mfa-admins-001",
    frameworkId: "fw-scubagear-m365-v1.5",
    controlId: "MS.AAD.3.1v1",
    controlTitle: "MFA SHALL be required for all users in administrative roles",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.ca.require_mfa_users",
    checkId: "chk-cis-mfa-users-002",
    frameworkId: "fw-scubagear-m365-v1.5",
    controlId: "MS.AAD.3.2v2",
    controlTitle: "MFA SHALL be required for all users",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.ca.block_legacy_auth",
    checkId: "chk-cis-legacy-auth-003",
    frameworkId: "fw-scubagear-m365-v1.5",
    controlId: "MS.AAD.1.1v1",
    controlTitle: "Legacy authentication SHALL be blocked",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.exo.disable_auto_forwarding",
    checkId: "chk-cis-exo-auto-forward-005",
    frameworkId: "fw-scubagear-m365-v1.5",
    controlId: "MS.EXO.4.2v1",
    controlTitle: "Automatic forwarding to external recipients SHALL be disabled",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.limit_global_admins",
    checkId: "chk-cis-global-admin-007",
    frameworkId: "fw-scubagear-m365-v1.5",
    controlId: "MS.AAD.7.1v1",
    controlTitle: "A minimum of two users and a maximum of four users SHALL be provisioned with the Global Administrator role",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.teams.external_access_policy",
    checkId: "chk-cis-teams-ext-access-010",
    frameworkId: "fw-scubagear-m365-v1.5",
    controlId: "MS.TEAMS.2.1v2",
    controlTitle: "External access SHALL be restricted to approved domains",
    classification: null,
    required: true,
    automated: true,
  },

  // -- NIST CSF controls (cross-mapping key CIS checks) --
  {
    checkSlug: "wt.entra.ca.require_mfa_admins",
    checkId: "chk-cis-mfa-admins-001",
    frameworkId: "fw-nist-csf-v2.0",
    controlId: "PR.AC-7",
    controlTitle: "Users, devices, and other assets are authenticated commensurate with the risk of the transaction",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.entra.ca.require_mfa_users",
    checkId: "chk-cis-mfa-users-002",
    frameworkId: "fw-nist-csf-v2.0",
    controlId: "PR.AC-7",
    controlTitle: "Users, devices, and other assets are authenticated commensurate with the risk of the transaction",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.m365.unified_audit_log",
    checkId: "chk-cis-audit-log-006",
    frameworkId: "fw-nist-csf-v2.0",
    controlId: "DE.AE-3",
    controlTitle: "Event data are collected and correlated from multiple sources and sensors",
    classification: null,
    required: true,
    automated: true,
  },
  {
    checkSlug: "wt.exo.disable_auto_forwarding",
    checkId: "chk-cis-exo-auto-forward-005",
    frameworkId: "fw-nist-csf-v2.0",
    controlId: "PR.DS-5",
    controlTitle: "Protections against data leaks are implemented",
    classification: null,
    required: true,
    automated: true,
  },
] as const;

// =============================================================================
// SEEDER IMPLEMENTATION
// =============================================================================

/**
 * Seed compliance data (checks, frameworks, controls).
 * Returns the number of records affected.
 */
export async function seedComplianceData(db: PrismaClient): Promise<number> {
  let count = 0;

  // -------------------------------------------------------------------------
  // 1. Checks
  // -------------------------------------------------------------------------
  for (const check of CHECKS) {
    await db.check.upsert({
      where: { id: check.id },
      create: {
        id: check.id,
        slug: check.slug,
        version: check.version,
        title: check.title,
        description: check.description,
        rationale: check.rationale,
        remediation: check.remediation,
        severity: check.severity,
        severityRank: check.severityRank,
        source: check.source,
        graphScopes: check.graphScopes,
        dataSource: check.dataSource,
        property: check.property,
        product: check.product,
        connectors: check.connectors,
        allowedValues: check.allowedValues as any,
        allowedOperators: check.allowedOperators,
      },
      update: {
        title: check.title,
        description: check.description,
        rationale: check.rationale,
        remediation: check.remediation,
        severity: check.severity,
        severityRank: check.severityRank,
        graphScopes: check.graphScopes,
        dataSource: check.dataSource,
        property: check.property,
        product: check.product,
        connectors: check.connectors,
        allowedValues: check.allowedValues as any,
        allowedOperators: check.allowedOperators,
      },
    });
    count++;
  }

  // -------------------------------------------------------------------------
  // 2. Frameworks
  // -------------------------------------------------------------------------
  for (const fw of FRAMEWORKS) {
    await db.framework.upsert({
      where: { id: fw.id },
      create: {
        id: fw.id,
        slug: fw.slug,
        name: fw.name,
        publisher: fw.publisher,
        version: fw.version,
        url: fw.url,
      },
      update: {
        name: fw.name,
        publisher: fw.publisher,
        version: fw.version,
        url: fw.url,
      },
    });
    count++;
  }

  // -------------------------------------------------------------------------
  // 3. Controls (link checks to frameworks)
  // -------------------------------------------------------------------------
  for (const ctrl of CONTROLS) {
    // Controls use a composite PK (checkSlug, frameworkId, controlId)
    const existing = await db.control.findUnique({
      where: {
        checkSlug_frameworkId_controlId: {
          checkSlug: ctrl.checkSlug,
          frameworkId: ctrl.frameworkId,
          controlId: ctrl.controlId,
        },
      },
    });

    if (existing) {
      await db.control.update({
        where: {
          checkSlug_frameworkId_controlId: {
            checkSlug: ctrl.checkSlug,
            frameworkId: ctrl.frameworkId,
            controlId: ctrl.controlId,
          },
        },
        data: {
          controlTitle: ctrl.controlTitle,
          checkId: ctrl.checkId,
          classification: ctrl.classification,
          required: ctrl.required,
          automated: ctrl.automated,
        },
      });
    } else {
      await db.control.create({
        data: {
          checkSlug: ctrl.checkSlug,
          checkId: ctrl.checkId,
          frameworkId: ctrl.frameworkId,
          controlId: ctrl.controlId,
          controlTitle: ctrl.controlTitle,
          classification: ctrl.classification,
          required: ctrl.required,
          automated: ctrl.automated,
        },
      });
    }
    count++;
  }

  return count;
}

/**
 * Dry-run: report what would be created without writing.
 */
export async function dryRunComplianceData(): Promise<number> {
  console.log("  Would create:");
  console.log(`    • ${CHECKS.length} compliance checks`);
  console.log(`    • ${FRAMEWORKS.length} compliance frameworks`);
  console.log(`    • ${CONTROLS.length} control mappings`);
  return CHECKS.length + FRAMEWORKS.length + CONTROLS.length;
}
