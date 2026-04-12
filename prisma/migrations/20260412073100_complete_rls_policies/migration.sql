-- =============================================================================
-- Watchtower — complete_rls_policies
-- =============================================================================
--
-- Implements RLS policies for every remaining workspace-scoped table.
-- The previous migration (20260411163304_rls_setup) established the pattern
-- on Finding, AuditEvent, AuditAccessLog, and Tenant. This migration applies
-- the same discipline to the eight remaining tables documented in section 5b.
--
-- Tables covered here:
--   1. Workspace       — id IS the workspace identifier (no workspaceId column)
--   2. Scope           — its own id is the scopeId parameter
--   3. Observation     — append-only; SELECT + INSERT only
--   4. Scan            — standard four-policy pattern
--   5. Membership      — scopeId nullable (workspace-wide memberships)
--   6. Role            — workspaceId nullable (system roles readable by all)
--   7. PluginRepo      — workspace-only, no scopeId column
--   8. IdempotencyKey   — workspace-only, no scopeId column
--
-- Tables deliberately NOT covered (see section 5b in rls_setup for rationale):
--   - RolePermission, MembershipRole  — join tables; rely on FK target's RLS
--   - Permission, Framework, Check, CheckFrameworkMapping — global tables
--   - AuditSigningKey                  — global table
--
-- =============================================================================

-- =============================================================================
-- 1. WORKSPACE
-- =============================================================================
-- The Workspace table has no workspaceId column — its `id` IS the workspace
-- identifier. A user may only see/modify the workspace they are currently
-- authenticated into (app.current_workspace_id()).

ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_select ON "Workspace"
  FOR SELECT
  USING (id = app.current_workspace_id());

CREATE POLICY workspace_insert ON "Workspace"
  FOR INSERT
  WITH CHECK (id = app.current_workspace_id());

CREATE POLICY workspace_update ON "Workspace"
  FOR UPDATE
  USING (id = app.current_workspace_id())
  WITH CHECK (id = app.current_workspace_id());

CREATE POLICY workspace_delete ON "Workspace"
  FOR DELETE
  USING (id = app.current_workspace_id());

-- =============================================================================
-- 2. SCOPE
-- =============================================================================
-- Scope has workspaceId but its own `id` IS the scope identifier. We pass
-- the scope's own id as the scopeId argument to app.row_visible(), so a user
-- can only see scopes they have been granted access to.

ALTER TABLE "Scope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Scope" FORCE ROW LEVEL SECURITY;

CREATE POLICY scope_select ON "Scope"
  FOR SELECT
  USING (app.row_visible("workspaceId", id));

CREATE POLICY scope_insert ON "Scope"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", id)
  );

CREATE POLICY scope_update ON "Scope"
  FOR UPDATE
  USING (app.row_visible("workspaceId", id))
  WITH CHECK (app.row_visible("workspaceId", id));

CREATE POLICY scope_delete ON "Scope"
  FOR DELETE
  USING (app.row_visible("workspaceId", id));

-- =============================================================================
-- 3. OBSERVATION
-- =============================================================================
-- Observation is append-only. UPDATE and DELETE are already blocked by the
-- trigger in 20260412073000_fix_grant_ordering (observation_append_only) and
-- the REVOKE of UPDATE/DELETE grants. We only need SELECT and INSERT policies.

ALTER TABLE "Observation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Observation" FORCE ROW LEVEL SECURITY;

CREATE POLICY observation_select ON "Observation"
  FOR SELECT
  USING (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY observation_insert ON "Observation"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", "scopeId")
  );

-- No UPDATE or DELETE policy: the trigger raises BEFORE any policy is checked,
-- and the runtime role lacks UPDATE/DELETE grants on this table.

-- =============================================================================
-- 4. SCAN
-- =============================================================================
-- Standard four-policy pattern: workspaceId + scopeId.

ALTER TABLE "Scan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Scan" FORCE ROW LEVEL SECURITY;

CREATE POLICY scan_select ON "Scan"
  FOR SELECT
  USING (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY scan_insert ON "Scan"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", "scopeId")
  );

CREATE POLICY scan_update ON "Scan"
  FOR UPDATE
  USING (app.row_visible("workspaceId", "scopeId"))
  WITH CHECK (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY scan_delete ON "Scan"
  FOR DELETE
  USING (app.row_visible("workspaceId", "scopeId"));

-- =============================================================================
-- 5. MEMBERSHIP
-- =============================================================================
-- Membership has workspaceId and a NULLABLE scopeId. A null scopeId means
-- workspace-wide membership. The app.row_visible() helper already handles
-- null scopeId correctly (null scope = workspace-level row, always visible
-- if the workspace matches).

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_select ON "Membership"
  FOR SELECT
  USING (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY membership_insert ON "Membership"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", "scopeId")
  );

CREATE POLICY membership_update ON "Membership"
  FOR UPDATE
  USING (app.row_visible("workspaceId", "scopeId"))
  WITH CHECK (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY membership_delete ON "Membership"
  FOR DELETE
  USING (app.row_visible("workspaceId", "scopeId"));

-- =============================================================================
-- 6. ROLE
-- =============================================================================
-- Role has a NULLABLE workspaceId. When NULL, it is a system role (built-in
-- preset like "owner", "admin", "viewer"). System roles must be readable by
-- any authenticated user but cannot be created, modified, or deleted through
-- the application.
--
-- Custom roles (workspaceId IS NOT NULL) follow the standard workspace-only
-- pattern — no scopeId column exists on Role.

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;

CREATE POLICY role_select ON "Role"
  FOR SELECT
  USING (
    "workspaceId" IS NULL
    OR "workspaceId" = app.current_workspace_id()
  );

-- INSERT/UPDATE/DELETE: only custom roles (workspaceId IS NOT NULL).
-- System roles are managed by the seed runner under watchtower_migrate.
CREATE POLICY role_insert ON "Role"
  FOR INSERT
  WITH CHECK ("workspaceId" = app.current_workspace_id());

CREATE POLICY role_update ON "Role"
  FOR UPDATE
  USING ("workspaceId" = app.current_workspace_id())
  WITH CHECK ("workspaceId" = app.current_workspace_id());

CREATE POLICY role_delete ON "Role"
  FOR DELETE
  USING ("workspaceId" = app.current_workspace_id());

-- =============================================================================
-- 7. PLUGIN REPO
-- =============================================================================
-- PluginRepo has workspaceId but NO scopeId. Workspace-only check:
-- visible to anyone in the workspace.

ALTER TABLE "PluginRepo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PluginRepo" FORCE ROW LEVEL SECURITY;

CREATE POLICY plugin_repo_select ON "PluginRepo"
  FOR SELECT
  USING ("workspaceId" = app.current_workspace_id());

CREATE POLICY plugin_repo_insert ON "PluginRepo"
  FOR INSERT
  WITH CHECK ("workspaceId" = app.current_workspace_id());

CREATE POLICY plugin_repo_update ON "PluginRepo"
  FOR UPDATE
  USING ("workspaceId" = app.current_workspace_id())
  WITH CHECK ("workspaceId" = app.current_workspace_id());

CREATE POLICY plugin_repo_delete ON "PluginRepo"
  FOR DELETE
  USING ("workspaceId" = app.current_workspace_id());

-- =============================================================================
-- 8. IDEMPOTENCY KEY
-- =============================================================================
-- IdempotencyKey has workspaceId but NO scopeId. Workspace-only check.
-- These are short-lived (24h sweeper) but must still be isolated per workspace.

ALTER TABLE "IdempotencyKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyKey" FORCE ROW LEVEL SECURITY;

CREATE POLICY idempotency_key_select ON "IdempotencyKey"
  FOR SELECT
  USING ("workspaceId" = app.current_workspace_id());

CREATE POLICY idempotency_key_insert ON "IdempotencyKey"
  FOR INSERT
  WITH CHECK ("workspaceId" = app.current_workspace_id());

CREATE POLICY idempotency_key_update ON "IdempotencyKey"
  FOR UPDATE
  USING ("workspaceId" = app.current_workspace_id())
  WITH CHECK ("workspaceId" = app.current_workspace_id());

CREATE POLICY idempotency_key_delete ON "IdempotencyKey"
  FOR DELETE
  USING ("workspaceId" = app.current_workspace_id());

-- =============================================================================
-- END
-- =============================================================================
-- After this migration runs, every table that carries a workspaceId (or IS
-- a workspace) has RLS enabled and forced. The only tables without RLS are:
--
--   Global tables (no workspace affinity):
--     Permission, Framework, Check, CheckFrameworkMapping, AuditSigningKey
--
--   Join tables (protected by FK target's RLS):
--     RolePermission, MembershipRole
--
-- A test in the application test suite verifies that every table with a
-- workspaceId column has RLS enabled. See Schema-Design-Notes.md
-- "RLS coverage test" for the exact assertion.
-- =============================================================================
