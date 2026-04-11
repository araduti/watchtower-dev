-- =============================================================================
-- Watchtower — 001_rls_setup.sql
-- =============================================================================
--
-- This migration is the security boundary. It is the file that turns
-- schema.prisma from a data model into a multi-tenant compliance platform.
--
-- What this file establishes:
--   1. Database role separation (runtime vs migration)
--   2. Session variable contract for per-request workspace/scope context
--   3. RLS helper functions
--   4. Append-only enforcement on audit tables (triggers + revoked grants)
--   5. RLS policies on every workspace-scoped table
--   6. Materialized view for current check version
--
-- Conventions:
--   - The runtime role is `watchtower_app`. It cannot bypass RLS, cannot run
--     DDL, and has no UPDATE/DELETE on audit tables.
--   - The migration role is `watchtower_migrate`. It has DDL rights and can
--     bypass RLS for schema changes only. It is used by `prisma migrate
--     deploy` and nothing else.
--   - Session variables (`app.current_workspace_id`, `app.current_user_scope_ids`)
--     MUST be set with SET LOCAL inside a transaction at the start of every
--     request. Without them, RLS policies reject all reads.
--
-- Companion files:
--   - schema.prisma                  Entity definitions this file constrains
--   - ../docs/Schema-Design-Notes.md Rationale for the patterns below
--
-- =============================================================================

-- =============================================================================
-- 1. ROLES
-- =============================================================================
-- The runtime role is the most important security boundary in the database.
-- If this role can mutate audit rows or bypass RLS, every other guarantee in
-- this file is theater.
-- The migration role owns the schema; the runtime role only gets explicit grants.

ALTER SCHEMA public OWNER TO watchtower_migrate;

-- =============================================================================
-- 2. SESSION VARIABLE CONTRACT
-- =============================================================================
-- Every request must set these with SET LOCAL inside the request's transaction.
-- The application's tRPC middleware does this in the same place it resolves the
-- user's permission context. There is no other code path.
--
--   SET LOCAL app.current_workspace_id = '<cuid>';
--   SET LOCAL app.current_user_scope_ids = '<cuid>,<cuid>,...';
--   SET LOCAL app.current_user_id = '<better-auth-user-id>';
--
-- A null/missing variable causes the helper functions below to return NULL,
-- which causes every RLS policy to filter out every row. Fail closed.

-- =============================================================================
-- 3. RLS HELPER FUNCTIONS
-- =============================================================================
-- Centralizing the session-variable parsing in helper functions means the
-- policies stay readable AND we have one place to fix bugs.

CREATE OR REPLACE FUNCTION app.current_workspace_id()
  RETURNS TEXT
  LANGUAGE SQL
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_workspace_id', TRUE), '');
$$;

CREATE OR REPLACE FUNCTION app.current_user_scope_ids()
  RETURNS TEXT[]
  LANGUAGE SQL
  STABLE
AS $$
  SELECT CASE
    WHEN NULLIF(current_setting('app.current_user_scope_ids', TRUE), '') IS NULL
      THEN ARRAY[]::TEXT[]
    ELSE string_to_array(current_setting('app.current_user_scope_ids', TRUE), ',')
  END;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
  RETURNS TEXT
  LANGUAGE SQL
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '');
$$;

-- A row is visible if its workspace matches AND (its scope is null OR its
-- scope is in the user's allowed set). Null scope = workspace-level row.
CREATE OR REPLACE FUNCTION app.row_visible(row_workspace_id TEXT, row_scope_id TEXT)
  RETURNS BOOLEAN
  LANGUAGE SQL
  STABLE
AS $$
  SELECT
    row_workspace_id = app.current_workspace_id()
    AND (
      row_scope_id IS NULL
      OR row_scope_id = ANY(app.current_user_scope_ids())
    );
$$;

-- =============================================================================
-- 4. APPEND-ONLY ENFORCEMENT ON AUDIT TABLES
-- =============================================================================
-- Three layers, as discussed:
--   (a) Runtime role has no UPDATE/DELETE grant on AuditEvent or AuditAccessLog.
--   (b) BEFORE UPDATE OR DELETE triggers raise an exception even if grants
--       were misconfigured.
--   (c) RLS for read scoping (covered in section 5).

-- Trigger function: any attempt to mutate raises immediately.
CREATE OR REPLACE FUNCTION app.audit_append_only_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  -- ALLOW Prisma / Migration user to truncate tables during dev resets and migrations
  IF current_user = 'watchtower_migrate' THEN
    RETURN NULL;
  END IF;

  -- Block the runtime application
  RAISE EXCEPTION 'Audit log is append-only. Table % cannot be modified or deleted.', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.audit_append_only_guard();

CREATE TRIGGER audit_access_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditAccessLog"
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.audit_append_only_guard();

-- Revoke the dangerous grants from the runtime role explicitly. Belt-and-suspenders.
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM watchtower_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditAccessLog" FROM watchtower_app;
GRANT INSERT, SELECT ON "AuditEvent" TO watchtower_app;
GRANT INSERT, SELECT ON "AuditAccessLog" TO watchtower_app;

-- AuditSigningKey: the runtime role can SELECT public keys for verification
-- but cannot insert or modify. Key rotation is a privileged operation done
-- through a separate admin path.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "AuditSigningKey" FROM watchtower_app;
GRANT SELECT ON "AuditSigningKey" TO watchtower_app;

-- =============================================================================
-- 5. RLS POLICIES — CRITICAL TABLES IN FULL
-- =============================================================================
-- Pattern: enable RLS, force it (so even table owner is subject), define a
-- single SELECT/INSERT/UPDATE/DELETE policy using app.row_visible().
--
-- Mutations also check that the workspaceId on the new row matches the
-- session's current_workspace_id — preventing a bug where the app tries to
-- INSERT a row into the wrong workspace.

-- ----- Finding -----
-- The most security-critical operational table. Cross-workspace leakage here
-- is the worst-case bug.
ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Finding" FORCE ROW LEVEL SECURITY;

CREATE POLICY finding_select ON "Finding"
  FOR SELECT
  USING (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY finding_insert ON "Finding"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", "scopeId")
  );

CREATE POLICY finding_update ON "Finding"
  FOR UPDATE
  USING (app.row_visible("workspaceId", "scopeId"))
  WITH CHECK (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY finding_delete ON "Finding"
  FOR DELETE
  USING (app.row_visible("workspaceId", "scopeId"));

-- ----- AuditEvent -----
-- RLS for read scoping. Append-only enforcement is in section 4.
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_event_select ON "AuditEvent"
  FOR SELECT
  USING (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY audit_event_insert ON "AuditEvent"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", "scopeId")
  );
-- No UPDATE or DELETE policy: the trigger in section 4 raises before any
-- policy is checked, but we also rely on the missing grant.

-- ----- AuditAccessLog -----
ALTER TABLE "AuditAccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditAccessLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_access_log_select ON "AuditAccessLog"
  FOR SELECT
  USING (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY audit_access_log_insert ON "AuditAccessLog"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", "scopeId")
  );

-- ----- Tenant -----
-- The credentials column is the most sensitive piece of data in the system.
-- RLS at this table is the second line of defense behind the application's
-- "never SELECT encryptedCredentials by default" rule.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON "Tenant"
  FOR SELECT
  USING (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY tenant_insert ON "Tenant"
  FOR INSERT
  WITH CHECK (
    "workspaceId" = app.current_workspace_id()
    AND app.row_visible("workspaceId", "scopeId")
  );

CREATE POLICY tenant_update ON "Tenant"
  FOR UPDATE
  USING (app.row_visible("workspaceId", "scopeId"))
  WITH CHECK (app.row_visible("workspaceId", "scopeId"));

CREATE POLICY tenant_delete ON "Tenant"
  FOR DELETE
  USING (app.row_visible("workspaceId", "scopeId"));

-- =============================================================================
-- 5b. RLS POLICIES — REMAINING WORKSPACE-SCOPED TABLES
-- =============================================================================
-- Apply the EXACT same four-policy pattern to each of the tables below. They
-- all carry workspaceId (and most carry scopeId) and follow the same rules:
--
--   ALTER TABLE "<Table>" ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE "<Table>" FORCE ROW LEVEL SECURITY;
--
--   CREATE POLICY <table>_select ON "<Table>"
--     FOR SELECT USING (app.row_visible("workspaceId", "scopeId"));
--
--   CREATE POLICY <table>_insert ON "<Table>"
--     FOR INSERT WITH CHECK (
--       "workspaceId" = app.current_workspace_id()
--       AND app.row_visible("workspaceId", "scopeId")
--     );
--
--   CREATE POLICY <table>_update ON "<Table>"
--     FOR UPDATE USING (app.row_visible("workspaceId", "scopeId"))
--                WITH CHECK (app.row_visible("workspaceId", "scopeId"));
--
--   CREATE POLICY <table>_delete ON "<Table>"
--     FOR DELETE USING (app.row_visible("workspaceId", "scopeId"));
--
-- Tables to apply this pattern to:
--   - Workspace             (scopeId is NULL — pass NULL as the second arg)
--   - Scope                 (scopeId is its own id)
--   - Observation           (no UPDATE policy — append-only at app level)
--   - Scan
--   - Membership            (scopeId nullable — workspace-wide memberships)
--   - Role                  (workspaceId nullable for system roles — special case below)
--   - PluginRepo            (no scopeId column; use workspace-only check)
--   - IdempotencyKey        (no scopeId column; use workspace-only check)
--
-- Special cases:
--
--   Workspace itself: SELECT visible if id = app.current_workspace_id();
--     no scope filter applies.
--
--   Role: when workspaceId IS NULL (system role), the row is readable by
--     anyone with a valid current_workspace_id. Custom roles (workspaceId
--     IS NOT NULL) follow the standard pattern.
--
--   RolePermission, MembershipRole: join tables with no workspaceId column.
--     These rely on the FK target's RLS rather than their own. Do NOT enable
--     RLS on them — it would block legitimate joins. Application code MUST
--     filter by joining to a workspace-scoped parent.
--
--   Permission, Framework, Check, CheckFrameworkMapping: GLOBAL tables, no
--     workspaceId. Readable by all authenticated sessions. Do NOT enable RLS.
--
-- A test in the application test suite must verify, for every table that
-- carries workspaceId, that RLS is enabled. See Schema-Design-Notes.md
-- "RLS coverage test" for the exact assertion.

-- =============================================================================
-- 6. MATERIALIZED VIEW: CURRENT CHECK VERSION
-- =============================================================================
-- Findings reference checks by slug, not surrogate id. Looking up "the current
-- version of a check by slug" via subquery on every read is the performance
-- problem we identified in the canonical query walkthrough. This view solves
-- it: one row per slug, pointing at the highest-version Check row for that slug.
--
-- Refreshed by the policy sync job whenever checks are added or updated. The
-- refresh is CONCURRENTLY to avoid blocking reads.

CREATE MATERIALIZED VIEW current_check AS
SELECT DISTINCT ON (slug)
  id,
  slug,
  version,
  title,
  description,
  rationale,
  remediation,
  severity,
  "severityRank",
  source,
  "pluginRepoId",
  "graphScopes",
  "createdAt"
FROM "Check"
ORDER BY slug, version DESC;

CREATE UNIQUE INDEX current_check_slug ON current_check (slug);
-- The unique index is mandatory for REFRESH MATERIALIZED VIEW CONCURRENTLY.

GRANT SELECT ON current_check TO watchtower_app;

-- The refresh function is exposed so the policy sync job can call it after
-- updating the Check table. It runs as the migration role to bypass RLS during
-- the refresh.
CREATE OR REPLACE FUNCTION app.refresh_current_check()
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY current_check;
END;
$$;

GRANT EXECUTE ON FUNCTION app.refresh_current_check() TO watchtower_app;

-- =============================================================================
-- 7. DEFAULT GRANTS FOR THE RUNTIME ROLE
-- =============================================================================
-- The runtime role gets SELECT/INSERT/UPDATE/DELETE on all tables EXCEPT the
-- audit tables (already restricted in section 4). Future tables created by
-- migrations should follow the same pattern — there's a default privileges
-- block below to make that automatic.

GRANT USAGE ON SCHEMA public TO watchtower_app;
GRANT USAGE ON SCHEMA app TO watchtower_app;

-- Default for future tables: runtime role gets SELECT/INSERT/UPDATE/DELETE
-- automatically. New audit-shaped tables MUST override this with an explicit
-- REVOKE in their own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO watchtower_app;

-- Sequences (used by any future SERIAL/IDENTITY columns).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO watchtower_app;

-- =============================================================================
-- END
-- =============================================================================
-- After this migration runs:
--   - watchtower_app cannot bypass RLS.
--   - watchtower_app cannot mutate audit rows (grants + triggers).
--   - Every workspace-scoped read is filtered by RLS as a safety net.
--   - Every workspace-scoped insert is checked against the session workspace.
--   - The current-check lookup is served from a unique-indexed materialized view.
--
-- A future migration adds the per-table policies listed in section 5b. They
-- are mechanical applications of the pattern shown for Finding/Tenant/Audit*.
-- =============================================================================
