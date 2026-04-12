-- =============================================================================
-- Watchtower — Fix grant ordering and append-only enforcement
-- =============================================================================
-- The initial RLS migration's bulk GRANT on line 375 ran after the per-table
-- REVOKEs in section 4, silently re-granting UPDATE/DELETE on audit tables.
-- This migration re-issues the revocations and adds missing protections.
-- =============================================================================

-- 1. Re-issue audit table revocations (undone by the bulk GRANT)
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM watchtower_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditAccessLog" FROM watchtower_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "AuditSigningKey" FROM watchtower_app;

-- 2. Observation table: enforce append-only at DB level
-- Schema comments claim "enforced at the DB level" but no REVOKE existed.
REVOKE UPDATE, DELETE, TRUNCATE ON "Observation" FROM watchtower_app;

-- 3. Add append-only trigger for Observation (same pattern as audit tables)
CREATE TRIGGER observation_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "Observation"
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.audit_append_only_guard();

-- 4. Fix SECURITY DEFINER function: add search_path restriction
-- Without this, a user could hijack the search path to execute arbitrary SQL
-- with the migrate role's privileges.
CREATE OR REPLACE FUNCTION app.refresh_current_check()
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.current_check;
END;
$$;
