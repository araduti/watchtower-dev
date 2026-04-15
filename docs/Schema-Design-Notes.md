# Schema Design Notes

Why the schema is the way it is.

This document captures the design rationale behind non-obvious schema decisions. The companion file is [`Architecture.md`](./Architecture.md), which covers how the pieces fit together at the system level. If a schema decision has a *why* that isn't obvious from the column name, it belongs here.

## 1. The hierarchy: Workspace → Scope → Tenant

The three-level hierarchy serves one goal: make one data model work for both MSPs (hundreds of tenants, loose grouping) and enterprises (handful of legal entities, hard isolation).

**Why Workspace is the billing boundary.** One customer contract = one Workspace. Stripe meters per workspace. API tokens are workspace-scoped. The workspace owner is the commercial relationship holder.

**Why Scope exists at all.** A flat Workspace → Tenant model works until an MSP wants to assign different consultants to different customer segments, or an enterprise needs legal isolation between business units. Scope is the layer that makes RBAC meaningful without adding a second product.

**Why `scopeIsolationMode` is on Workspace, not Scope.** A workspace is either MSP-shaped or enterprise-shaped — it doesn't make sense for some scopes within a workspace to be soft-isolated while others are strict. The mode is a workspace-level policy decision.

**Why `parentScopeId` with a depth cap of 3.** Some MSPs organize by region → vertical → customer group. Three levels covers every use case we've heard; deeper nesting creates UI confusion and query complexity that's not worth it. The cap is enforced in application code, not the database, because depth limits are a policy decision, not a data integrity constraint.

**Why `metadata` is JSONB.** Scopes need arbitrary key-value data (region, industry, compliance tier) that varies by customer. Columns for every possible key would be rigid and wasteful. JSONB with application-level validation via Zod is the right trade-off for a multi-tenant SaaS — each customer can tag scopes differently.

## 2. Findings are durable, scans are ephemeral

This is the most important structural decision in the schema.

**Why one Finding per `(tenantId, checkSlug)`.** Most compliance tools model each scan result as an independent snapshot. That makes "how long has this been broken?" a cross-scan join, drift detection a comparison query, and muting/acceptance state impossible to maintain cleanly. Watchtower inverts this: a Finding is a durable object that tracks a single compliance condition across its entire lifecycle.

**Why `checkSlug` and not `checkId`.** Checks are versioned — the same slug can have version 1, 2, 3. When a check is updated (new description, updated remediation), the Finding should still reference the *concept* of the check, not a specific version. Using the slug means Findings survive check version bumps without migration.

**Why `severityRank` alongside `severity`.** Postgres can't natively `ORDER BY enum` in a performant way. `severityRank` is a numeric mirror (CRITICAL=5, HIGH=4, ..., INFO=1) that enables the composite index `(workspaceId, scopeId, status, severityRank DESC, firstSeenAt)` to serve the canonical findings list query from index alone.

**Why `visibility` is orthogonal to `status`.** A muted finding still has a real status (OPEN, ACKNOWLEDGED, etc.). Muting is about UI presentation and notification suppression, not about the compliance state. Combining them into one field would force a choice between "this finding is resolved" and "this finding is muted" — they're independent dimensions.

**Why `regressionFromResolvedAt`.** When a previously resolved finding fails again, the system needs to distinguish between "new finding" and "regression." The timestamp records when the resolution was overturned, which is critical for SLA calculations and for the audit trail.

**Why `latestEvidenceId` is denormalized.** The finding detail page needs to show the most recent evidence without scanning all evidence rows. A trigger in `001_rls_setup.sql` keeps this pointer current. The denormalization trades write cost (trigger on Evidence insert) for read performance on the most-hit query pattern.

## 3. Evidence is append-only

**Why Evidence has no UPDATE or DELETE grants.** Evidence is the raw proof behind a compliance finding. Modifying it after collection would undermine the entire compliance audit trail. The runtime role (`watchtower_app`) has only `INSERT` and `SELECT` on this table — no `UPDATE`, no `DELETE`, no `TRUNCATE`.

**Why Evidence carries denormalized `workspaceId` and `scopeId`.** RLS policies need these columns for row visibility. Joining through Scan → Tenant → Scope on every query would make RLS evaluation expensive. The denormalization costs ~16 bytes per row but makes RLS evaluation O(1) per row.

**Why `rawEvidence` is JSON, not S3-only.** Small evidence payloads (a boolean, a policy setting, a list of users) are better stored inline for query performance. Large evidence (full audit exports, screenshots) goes to Garage S3 via `storageKey`. The schema supports both patterns without forcing everything through object storage.

## 4. RBAC: permissions, not roles

**Why the Permission table is the source of truth.** Role-based access control systems that check `user.role === "admin"` are brittle — adding a new role means touching every authorization check. Watchtower checks `user.can("findings:mute", { scopeId })`. The Permission catalog defines what actions exist; Roles are just bags of permissions.

**Why `scopeApplicability` on Permission.** Some permissions only make sense at the workspace level (e.g., `workspace:delete`), others only at the scope level (e.g., `tenants:create`), and some at both (e.g., `checks:read`). This field prevents customers from creating nonsensical roles — a scope-only permission can't be granted workspace-wide.

**Why locked permissions (`assignableToCustomRoles: false`).** Four permissions are too dangerous for custom roles: `workspace:delete`, `workspace:transfer_ownership`, `members:remove_owner`, `roles:edit_system_roles`. These are held only by the Owner system role. The seed runner validates this invariant.

**Why Membership has a nullable `scopeId`.** A user with `scopeId: null` has workspace-wide access (subject to `scopeIsolationMode`). A user with a specific `scopeId` can only see data in that scope. This lets the same Membership model express "this person is a workspace admin" and "this person is a scope-specific compliance officer."

**Why `MembershipRole` is a separate table.** A user can hold multiple roles within a single membership. The composite primary key `(membershipId, roleId)` is a clean many-to-many join that's easy to reason about and impossible to corrupt with duplicate entries.

## 5. The audit log chain

**Why per-workspace chains, not a global chain.** A global chain would create a write bottleneck — every audit event across every workspace would contend for the same sequence counter. Per-workspace chains are independent, meaning workspace A's audit rate doesn't affect workspace B's write latency.

**Why `chainSequence` alongside the hash chain.** The hash chain alone detects tampering (changed or reordered events). `chainSequence` additionally detects *deletion* — a gap in the monotonic sequence proves events were removed, even if the remaining chain hashes are still valid.

**Why `signature` is stored alongside `rowHash`.** The Ed25519 signature proves that the row was produced by a holder of the private key, not just by anyone who can compute SHA-256. An attacker who modifies a row and recomputes the hash chain can't forge the signature.

**Why `signingKeyId` is a foreign key.** Keys rotate. Historical events must remain verifiable against the key that signed them. The FK points to `AuditSigningKey`, which holds only the public key — the private key never enters the database.

**Why `occurredAt` and `recordedAt` are separate.** `occurredAt` is application-set (when the action happened). `recordedAt` is database-set (when the row was inserted). Under normal operation they're milliseconds apart, but in recovery scenarios (replaying events, ingesting delayed scan results), the distinction matters for audit accuracy.

## 6. Tenant credentials

**Why `encryptedCredentials` is `Bytes`.** Credentials are encrypted at rest with a workspace-scoped data encryption key (DEK). The sealed blob includes the ciphertext, IV, and auth tag. It's `Bytes` (not `String`) because encrypted data isn't human-readable and shouldn't be treated as text.

**Why credentials are NEVER selected by default.** The Prisma `select` projections in every router explicitly list fields — and `encryptedCredentials` is never in the list. Decryption happens only inside the vendor adapter at execution time, never in a router or API response. This is a defense-in-depth guarantee: even a bug that returns a raw Prisma object can't leak credentials if they were never fetched.

## 7. Checks, Frameworks, and Controls

**Why Checks are global (no `workspaceId`) for builtins.** CIS and NIST checks are the same for every customer. Scoping them per-workspace would mean duplicating hundreds of check definitions with no benefit. Plugin checks are workspace-scoped via `pluginRepoId`.

**Why Controls use a composite primary key `(checkSlug, frameworkId, controlId)`.** A single check can map to multiple framework controls, and the same control ID can appear across frameworks. The three-part key uniquely identifies "this check implements this specific control in this specific framework."

**Why `ControlAssertion.operator` is a string, not an enum.** The operator set grows as new check types are added (`eq`, `in`, `lte`, `ca-match`, etc.). A Prisma enum would require a migration for every new operator. A string with application-level validation via Zod is more extensible.

## 8. Soft-delete is limited to three tables

**Why only Workspace, Scope, and Tenant use `deletedAt`.** These three carry compliance context — hard-deleting a tenant would orphan every finding, scan, and evidence artifact that references it. Soft-delete preserves referential integrity while hiding the row from normal queries.

**Why other tables don't soft-delete.** Adding `deletedAt` to every table creates filter complexity everywhere. Roles, Memberships, and RolePermissions hard-delete because they don't carry compliance history. Findings, Evidence, and AuditEvents are never deleted at all — they're the compliance record.

**Why `onDelete: Restrict` on audit table foreign keys.** You cannot cascade-destroy compliance evidence, even by accident, even in tests. If code tries to delete a workspace that has audit events, the database rejects it. This is a safety net against data loss bugs.

## 9. Indexes are shaped for RLS-filtered queries

**Why the composite index on Finding includes `severityRank DESC`.** The canonical findings list query is: "show me all open findings for this workspace and these scopes, ordered by severity (highest first), then by age (oldest first)." The index `(workspaceId, scopeId, status, severityRank DESC, firstSeenAt)` serves this exact pattern from index alone — no table scan needed.

**Why denormalized `workspaceId` and `scopeId` on Evidence, Scan, Finding.** RLS policies evaluate `WHERE workspaceId = current_setting('app.current_workspace_id')`. Without denormalization, RLS would need to join through Tenant → Scope → Workspace on every row access. The denormalization makes RLS evaluation a simple column comparison.

**Why `@@unique([workspaceId, msTenantId])` on Tenant.** A single M365 tenant should only be connected once per workspace. Without this constraint, two team members could independently connect the same tenant, creating duplicate findings and scan conflicts.
