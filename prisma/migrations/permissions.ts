// =============================================================================
// Watchtower — Permissions catalog and system roles
// =============================================================================
//
// PUBLIC CONTRACT WARNING:
// Permission keys, role slugs, and the locked list are public contracts.
// Once shipped, a key may NEVER be renamed or removed — only deprecated.
// Customers will build custom roles and integrations against these strings.
//
// To ADD a permission: append to PERMISSIONS, decide if it's locked, decide
// which system roles get it. Bump SEED_VERSION.
//
// To REMOVE a permission: don't. Mark it deprecated in a comment, stop
// granting it to system roles, leave it in the catalog forever.
//
// =============================================================================

import { ScopeApplicability } from "@prisma/client";

export const SEED_VERSION = 1;

// =============================================================================
// PERMISSION CATALOG
// =============================================================================
// Each entry: key, category, description, scope applicability, and whether
// customers can compose it into custom roles. The `assignableToCustomRoles:
// false` entries are the locked list — only system roles can carry them.

export type PermissionSeed = {
  key: string;
  category: string;
  description: string;
  scopeApplicability: ScopeApplicability;
  assignableToCustomRoles: boolean;
};

export const PERMISSIONS: readonly PermissionSeed[] = [
  // ----- Tenants (M365 connections) -----
  { key: "tenants:read", category: "tenants", description: "View connected M365 tenants and their connection status.", scopeApplicability: "BOTH", assignableToCustomRoles: true },
  { key: "tenants:create", category: "tenants", description: "Connect a new M365 tenant to a scope.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "tenants:edit", category: "tenants", description: "Edit tenant display name and metadata. Does not include credential rotation.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "tenants:delete", category: "tenants", description: "Disconnect a tenant. Findings and audit history are retained.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "tenants:rotate_credentials", category: "tenants", description: "Rotate stored credentials or re-authenticate via Workload Identity Federation.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },

  // ----- Scans -----
  { key: "scans:read", category: "scans", description: "View scan history and current scan status.", scopeApplicability: "BOTH", assignableToCustomRoles: true },
  { key: "scans:trigger", category: "scans", description: "Manually trigger a scan against a connected tenant.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "scans:cancel", category: "scans", description: "Cancel a pending or running scan.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "scans:configure_schedule", category: "scans", description: "Configure scheduled scan windows and frequency.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },

  // ----- Findings (the bulk of day-to-day usage) -----
  { key: "findings:read", category: "findings", description: "View findings within the user's accessible scopes.", scopeApplicability: "BOTH", assignableToCustomRoles: true },
  { key: "findings:acknowledge", category: "findings", description: "Mark a finding as acknowledged. A lightweight 'I've seen this' action.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:assign", category: "findings", description: "Assign a finding to a user for follow-up.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:mute", category: "findings", description: "Hide a finding from default views. Does not change its compliance status.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:unmute", category: "findings", description: "Restore a muted finding to default visibility.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:accept_risk", category: "findings", description: "Formally accept a finding as a documented compliance decision. Requires expiration date and justification.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:revoke_acceptance", category: "findings", description: "Revoke an existing risk acceptance, returning the finding to OPEN.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:resolve", category: "findings", description: "Manually resolve a finding when the engine cannot verify automatically.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:reopen", category: "findings", description: "Reopen a previously resolved finding.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:add_note", category: "findings", description: "Add a note or comment to a finding.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "findings:export", category: "findings", description: "Export findings to CSV, JSON, or PDF.", scopeApplicability: "BOTH", assignableToCustomRoles: true },

  // ----- Evidence -----
  { key: "evidence:read", category: "evidence", description: "View evidence attached to findings.", scopeApplicability: "BOTH", assignableToCustomRoles: true },
  { key: "evidence:upload", category: "evidence", description: "Attach manual evidence (PDFs, screenshots) to findings.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },
  { key: "evidence:delete", category: "evidence", description: "Remove an evidence attachment. The deletion itself is audited.", scopeApplicability: "SCOPE_ONLY", assignableToCustomRoles: true },

  // ----- Checks and frameworks (mostly read for non-admins) -----
  { key: "checks:read", category: "checks", description: "Browse the catalog of available checks.", scopeApplicability: "BOTH", assignableToCustomRoles: true },
  { key: "frameworks:read", category: "frameworks", description: "Browse compliance frameworks and their check mappings.", scopeApplicability: "BOTH", assignableToCustomRoles: true },

  // ----- Plugin engine (custom checks via GitOps) -----
  { key: "plugins:read", category: "plugins", description: "View connected plugin repositories and their sync status.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "plugins:connect_repo", category: "plugins", description: "Connect a GitHub repository as a custom check source.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "plugins:disconnect_repo", category: "plugins", description: "Disconnect a plugin repository. Existing findings are retained.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "plugins:approve_check", category: "plugins", description: "Approve a customer-authored check before it runs in production. The human gate.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },

  // ----- Reports and analytics -----
  { key: "reports:read", category: "reports", description: "View compliance reports and dashboards.", scopeApplicability: "BOTH", assignableToCustomRoles: true },
  { key: "reports:export", category: "reports", description: "Export reports to PDF, CSV, or JSON.", scopeApplicability: "BOTH", assignableToCustomRoles: true },
  { key: "analytics:read", category: "analytics", description: "View cross-scope analytics and rollups.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },

  // ----- Workspace administration -----
  { key: "workspace:read", category: "workspace", description: "View workspace settings and metadata.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "workspace:edit_settings", category: "workspace", description: "Edit workspace name, isolation mode, and other settings.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "workspace:manage_billing", category: "workspace", description: "Manage Stripe billing, view invoices, update payment methods.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "workspace:view_audit_log", category: "workspace", description: "View the workspace audit log.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "workspace:export_audit_log", category: "workspace", description: "Export the audit log. The export itself is audited.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "workspace:delete", category: "workspace", description: "Permanently delete the workspace. LOCKED — system roles only.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: false },
  { key: "workspace:transfer_ownership", category: "workspace", description: "Transfer workspace ownership to another user. LOCKED — system roles only.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: false },

  // ----- Scope administration -----
  { key: "scopes:read", category: "scopes", description: "View scopes within the workspace.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "scopes:create", category: "scopes", description: "Create a new scope.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "scopes:edit", category: "scopes", description: "Edit scope name, slug, and metadata.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "scopes:delete", category: "scopes", description: "Soft-delete a scope. Tenants must be moved or disconnected first.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },

  // ----- Membership and roles (the meta layer) -----
  { key: "members:read", category: "members", description: "View workspace members and their roles.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "members:invite", category: "members", description: "Invite new users to the workspace.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "members:remove", category: "members", description: "Remove a user from the workspace. Cannot remove an owner.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "members:edit_roles", category: "members", description: "Change role assignments for existing members.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "members:remove_owner", category: "members", description: "Remove a user holding the Owner role. LOCKED — system roles only.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: false },
  { key: "roles:read", category: "roles", description: "View roles and their permission assignments.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "roles:create", category: "roles", description: "Create a custom role from the permission catalog.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "roles:edit", category: "roles", description: "Edit a custom role's permissions and metadata.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "roles:delete", category: "roles", description: "Delete a custom role. Members holding only this role lose all access.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "roles:edit_system_roles", category: "roles", description: "Modify built-in system role definitions. LOCKED — system roles only.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: false },

  // ----- Integrations (webhooks, Slack, Jira) -----
  { key: "integrations:read", category: "integrations", description: "View configured integrations.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "integrations:create", category: "integrations", description: "Create a new integration (webhook, Slack, Jira).", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "integrations:edit", category: "integrations", description: "Edit an existing integration's configuration.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "integrations:delete", category: "integrations", description: "Remove an integration.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },

  // ----- API tokens -----
  { key: "api_tokens:read", category: "api_tokens", description: "View API tokens (without their secret values).", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "api_tokens:create", category: "api_tokens", description: "Create a new API token. The secret is shown only once.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
  { key: "api_tokens:revoke", category: "api_tokens", description: "Revoke an API token immediately.", scopeApplicability: "WORKSPACE_ONLY", assignableToCustomRoles: true },
] as const;

// =============================================================================
// LOCKED PERMISSIONS LIST (derived)
// =============================================================================
// These are the permissions where assignableToCustomRoles = false. They exist
// in the catalog but cannot be composed into customer-defined roles. Only
// system roles can carry them. The role editor UI must filter these out.

export const LOCKED_PERMISSION_KEYS = PERMISSIONS
  .filter(p => !p.assignableToCustomRoles)
  .map(p => p.key);

// Sanity: print these in the seed runner so a future maintainer notices
// when they accidentally lock or unlock a permission.

// =============================================================================
// SYSTEM ROLE PRESETS
// =============================================================================
// Four roles cover ~80% of customer needs. The remaining 20% creates custom
// roles, which is the entire point of the permission-first design.

type SystemRoleSeed = {
  slug: string;
  name: string;
  description: string;
  permissions: readonly string[];
};

// Helper to grab every permission key matching a category prefix.
const allInCategory = (category: string) =>
  PERMISSIONS.filter(p => p.category === category).map(p => p.key);

// Helper to grab every permission key (used by Owner).
const allKeys = () => PERMISSIONS.map(p => p.key);

// ----- OWNER -----
// Every permission, including locked ones. Exactly one Owner per workspace.
// The only role that can spend money, transfer ownership, or remove other
// owners. Created automatically when a workspace is created.
const OWNER: SystemRoleSeed = {
  slug: "owner",
  name: "Owner",
  description: "Full access to everything in the workspace, including billing, ownership transfer, and workspace deletion. Exactly one Owner per workspace.",
  permissions: allKeys(),
};

// ----- ADMIN -----
// Every permission EXCEPT the locked ones. Can run the platform end-to-end
// but cannot end the company relationship or transfer ownership.
const ADMIN: SystemRoleSeed = {
  slug: "admin",
  name: "Admin",
  description: "Full operational access. Can manage tenants, members, scopes, integrations, and the audit log. Cannot delete the workspace, transfer ownership, or remove other owners.",
  permissions: PERMISSIONS
    .filter(p => p.assignableToCustomRoles)
    .map(p => p.key),
};

// ----- COMPLIANCE OFFICER -----
// Strong inside the compliance domain (lifecycle, evidence, exports, audit
// log). Explicitly out of operational tenant management. Does NOT include
// tenants:rotate_credentials — credential hygiene is an Admin power.
const COMPLIANCE_OFFICER: SystemRoleSeed = {
  slug: "compliance_officer",
  name: "Compliance Officer",
  description: "Full lifecycle management of findings (mute, accept risk, resolve), evidence upload, report export, and audit log access. Cannot connect or disconnect tenants, manage members, or manage billing.",
  permissions: [
    "tenants:read",
    "scans:read",
    "scans:trigger",
    ...allInCategory("findings"),
    ...allInCategory("evidence"),
    "checks:read",
    "frameworks:read",
    "plugins:read",
    "reports:read",
    "reports:export",
    "analytics:read",
    "workspace:read",
    "workspace:view_audit_log",
    "workspace:export_audit_log",
    "scopes:read",
    "members:read",
    "roles:read",
  ],
};

// ----- AUDITOR (read-only) -----
// Read findings, read audit log, read reports, export reports. No write
// permissions whatsoever. The role you give to an external auditor during
// an audit window or to a junior analyst still ramping up.
const AUDITOR: SystemRoleSeed = {
  slug: "auditor",
  name: "Auditor",
  description: "Read-only access to findings, scans, evidence, reports, and the audit log. Can export findings and reports for external review. Cannot mute, accept risk, or change anything.",
  permissions: [
    "tenants:read",
    "scans:read",
    "findings:read",
    "findings:export",
    "evidence:read",
    "checks:read",
    "frameworks:read",
    "reports:read",
    "reports:export",
    "analytics:read",
    "workspace:read",
    "workspace:view_audit_log",
    "scopes:read",
    "members:read",
    "roles:read",
  ],
};

export const SYSTEM_ROLES: readonly SystemRoleSeed[] = [
  OWNER,
  ADMIN,
  COMPLIANCE_OFFICER,
  AUDITOR,
] as const;

// =============================================================================
// MINIMAL UPSERT HELPER
// =============================================================================
// Idempotent. Safe to run on every deploy. The runner in seeds/index.ts
// orchestrates dry-run, environment safety, and progress logging on top of
// these primitives.

import type { PrismaClient } from "@prisma/client";

export async function upsertPermissions(db: PrismaClient): Promise<number> {
  let count = 0;
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: p.key },
      create: p,
      update: {
        category: p.category,
        description: p.description,
        scopeApplicability: p.scopeApplicability,
        assignableToCustomRoles: p.assignableToCustomRoles,
      },
    });
    count++;
  }
  return count;
}

export async function upsertSystemRoles(db: PrismaClient): Promise<number> {
  let count = 0;
  for (const role of SYSTEM_ROLES) {
    // System roles have workspaceId = null. Identified by the unique
    // constraint (workspaceId, slug) — null + slug must be unique.
    const existing = await db.role.findFirst({
      where: { workspaceId: null, slug: role.slug },
    });

    const upserted = existing
      ? await db.role.update({
          where: { id: existing.id },
          data: {
            name: role.name,
            description: role.description,
            isSystem: true,
            isAssignable: true,
          },
        })
      : await db.role.create({
          data: {
            workspaceId: null,
            slug: role.slug,
            name: role.name,
            description: role.description,
            isSystem: true,
            isAssignable: true,
          },
        });

    // Replace the role's permission set wholesale. This means seed runs are
    // authoritative for system roles — local edits will be overwritten.
    await db.rolePermission.deleteMany({ where: { roleId: upserted.id } });
    await db.rolePermission.createMany({
      data: role.permissions.map(permissionKey => ({
        roleId: upserted.id,
        permissionKey,
      })),
    });

    count++;
  }
  return count;
}
