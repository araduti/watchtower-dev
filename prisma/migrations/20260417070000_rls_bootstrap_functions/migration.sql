-- =============================================================================
-- Watchtower — RLS bootstrap functions (SECURITY DEFINER)
-- =============================================================================
--
-- These functions solve the RLS chicken-and-egg problem:
--
--   resolveSession() needs to query the Workspace table to map a Better Auth
--   org ID to a Watchtower workspace ID, and loadPermissionContext() needs to
--   query Membership, Workspace, and Scope to compute what RLS session
--   variables should be set — but all of those tables have RLS policies that
--   require those very session variables to already be set.
--
-- Solution: narrow SECURITY DEFINER functions that run as watchtower_migrate
-- (BYPASSRLS). Each function is tightly scoped to the exact bootstrap query
-- it replaces. The watchtower_app role gets EXECUTE — nothing more.
--
-- Security notes:
--   - SECURITY DEFINER runs as the function OWNER (watchtower_migrate), which
--     has BYPASSRLS. This is intentional — these are bootstrap queries.
--   - search_path is pinned to pg_catalog to prevent search-path hijacking.
--   - Each function accepts only TEXT parameters that are validated by the
--     application layer (assertSafeIdentifier in rls.ts, Zod schemas in tRPC).
--   - The functions return only the minimal columns needed by the application.
--   - EXECUTE is explicitly revoked from PUBLIC on every function (defense-in-
--     depth — the app schema USAGE grant already restricts access, but we
--     never rely on a single layer).
--
-- Trust contract:
--   These functions accept raw TEXT parameters and perform NO internal caller
--   validation. They MUST only be called from server-side code with values
--   derived from an authenticated Better Auth session — never with user-
--   supplied input. The callers are:
--     - resolveSession()         → packages/auth/src/session.ts
--     - loadPermissionContext()   → apps/web/src/server/permissions.ts
--   Any new caller MUST be reviewed for the same invariant.
--
-- =============================================================================

-- =============================================================================
-- 0. DEFAULT PRIVILEGES — REVOKE PUBLIC EXECUTE ON FUTURE FUNCTIONS
-- =============================================================================
-- PostgreSQL grants EXECUTE to PUBLIC by default. For SECURITY DEFINER
-- functions that run with BYPASSRLS, this is unacceptable. Prevent it for
-- all future functions in the app schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- =============================================================================
-- 1. RESOLVE WORKSPACE FROM BETTER AUTH ORG ID
-- =============================================================================
-- Used by resolveSession() in packages/auth/src/session.ts.
-- Maps a Better Auth Organization.id to a Watchtower Workspace.id.
--
-- SECURITY CONTRACT: ba_org_id MUST come from the authenticated session's
-- activeOrganizationId field — never from user-supplied input. The function
-- does not validate caller identity; it trusts the application layer.

CREATE OR REPLACE FUNCTION app.resolve_workspace_from_org(ba_org_id TEXT)
  RETURNS TABLE (workspace_id TEXT, deleted_at TIMESTAMPTZ)
  LANGUAGE SQL
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT w.id, w."deletedAt"
  FROM public."Workspace" w
  WHERE w."betterAuthOrgId" = ba_org_id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION app.resolve_workspace_from_org(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_workspace_from_org(TEXT) TO watchtower_app;

-- =============================================================================
-- 2. LOAD USER MEMBERSHIPS WITH PERMISSIONS
-- =============================================================================
-- Used by loadPermissionContext() in apps/web/src/server/permissions.ts.
-- Returns one row per (scopeId, permissionKey) combination for the given
-- user in the given workspace. The application aggregates these into
-- a Set<permission> and a list of accessible scope IDs.
--
-- SECURITY CONTRACT: p_user_id and p_workspace_id MUST come from a validated
-- session (resolveSession() must have succeeded). The function does not check
-- whether the workspace is soft-deleted — the caller (loadPermissionContext)
-- is only invoked after resolveSession() has verified workspace existence and
-- deletion status.

CREATE OR REPLACE FUNCTION app.load_user_memberships(p_user_id TEXT, p_workspace_id TEXT)
  RETURNS TABLE (scope_id TEXT, permission_key TEXT)
  LANGUAGE SQL
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT m."scopeId", rp."permissionKey"
  FROM public."Membership" m
  JOIN public."MembershipRole" mr ON mr."membershipId" = m.id
  JOIN public."RolePermission" rp ON rp."roleId" = mr."roleId"
  WHERE m."userId" = p_user_id
    AND m."workspaceId" = p_workspace_id;
$$;

REVOKE EXECUTE ON FUNCTION app.load_user_memberships(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.load_user_memberships(TEXT, TEXT) TO watchtower_app;

-- =============================================================================
-- 3. GET WORKSPACE SCOPE ISOLATION MODE
-- =============================================================================
-- Used by loadPermissionContext() to determine whether workspace-wide
-- memberships grant access to all scopes (SOFT) or only explicitly scoped
-- memberships count (STRICT).
--
-- SECURITY CONTRACT: p_workspace_id MUST come from a validated session.

CREATE OR REPLACE FUNCTION app.get_workspace_isolation_mode(p_workspace_id TEXT)
  RETURNS TEXT
  LANGUAGE SQL
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT w."scopeIsolationMode"::TEXT
  FROM public."Workspace" w
  WHERE w.id = p_workspace_id
    AND w."deletedAt" IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION app.get_workspace_isolation_mode(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_workspace_isolation_mode(TEXT) TO watchtower_app;

-- =============================================================================
-- 4. GET ALL ACTIVE SCOPE IDS FOR A WORKSPACE
-- =============================================================================
-- Used by loadPermissionContext() when scopeIsolationMode is SOFT and the
-- user has a workspace-wide membership — they get access to every scope.
--
-- SECURITY CONTRACT: p_workspace_id MUST come from a validated session.
-- This function returns the complete list of scope CUIDs for a workspace.
-- If called with an attacker-controlled workspace ID, it would leak the
-- scope topology of another tenant. The caller MUST ensure p_workspace_id
-- is the authenticated user's own workspace.

CREATE OR REPLACE FUNCTION app.get_workspace_scope_ids(p_workspace_id TEXT)
  RETURNS TEXT[]
  LANGUAGE SQL
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT COALESCE(array_agg(s.id), ARRAY[]::TEXT[])
  FROM public."Scope" s
  WHERE s."workspaceId" = p_workspace_id
    AND s."deletedAt" IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION app.get_workspace_scope_ids(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_workspace_scope_ids(TEXT) TO watchtower_app;

-- =============================================================================
-- 5. REVOKE PUBLIC ON EXISTING SECURITY DEFINER FUNCTION
-- =============================================================================
-- The refresh_current_check function from the initial RLS migration also
-- runs as SECURITY DEFINER but never had PUBLIC revoked.
REVOKE EXECUTE ON FUNCTION app.refresh_current_check() FROM PUBLIC;

-- =============================================================================
-- END
-- =============================================================================
-- After this migration, the session resolution and permission loading code
-- can call these functions via $queryRaw to bootstrap the RLS context without
-- being blocked by the very RLS policies they need to configure.
-- =============================================================================
