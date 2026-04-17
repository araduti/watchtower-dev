-- =============================================================================
-- Watchtower — SECURITY DEFINER function for AuditSigningKey registration
-- =============================================================================
--
-- The watchtower_app role has only SELECT on AuditSigningKey (INSERT/UPDATE/
-- DELETE are revoked in 20260411163304_rls_setup and re-revoked in
-- 20260412073000_fix_grant_ordering). This is intentional: the signing key
-- table is a high-integrity security boundary.
--
-- However, the runtime audit module needs to register the public key on first
-- use (lazy bootstrap). This is the same class of chicken-and-egg problem
-- solved by the RLS bootstrap functions in 20260417070000.
--
-- Solution: a narrow SECURITY DEFINER function that performs an atomic
-- find-or-create. It runs as watchtower_migrate (BYPASSRLS, table owner)
-- so it can INSERT, but the watchtower_app role only gets EXECUTE.
--
-- Security notes:
--   - SECURITY DEFINER runs as the function OWNER (watchtower_migrate).
--   - search_path is pinned to pg_catalog to prevent search-path hijacking.
--   - The function validates that p_algorithm is a known value.
--   - EXECUTE is revoked from PUBLIC (defense-in-depth).
--
-- Trust contract:
--   The public key PEM and algorithm are derived from the Ed25519 private key
--   loaded from AUDIT_SIGNING_KEY_PATH. They are never user-supplied input.
--   The sole caller is ensureSigningKeyRegistered() in packages/db/src/audit.ts.
--
-- =============================================================================

CREATE OR REPLACE FUNCTION app.ensure_signing_key(p_public_key TEXT, p_algorithm TEXT)
  RETURNS TEXT
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_id TEXT;
BEGIN
  -- Validate algorithm to prevent misuse
  IF p_algorithm IS NULL OR p_algorithm <> 'ed25519' THEN
    RAISE EXCEPTION 'ensure_signing_key: unsupported algorithm "%". Only "ed25519" is allowed.', p_algorithm
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Try to find an existing active key with the same public key
  SELECT id INTO v_id
  FROM public."AuditSigningKey"
  WHERE "publicKey" = p_public_key
    AND "retiredAt" IS NULL
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Insert a new key. Use gen_random_uuid() for the ID since this function
  -- runs outside Prisma's CUID generation. AuditSigningKey rows will have
  -- UUID-format IDs rather than CUIDs like other entities — this is
  -- acceptable because IDs are opaque TEXT strings and the column type is
  -- TEXT, not a native UUID type. The trade-off is necessary to keep INSERT
  -- privilege restricted to this SECURITY DEFINER function.
  INSERT INTO public."AuditSigningKey" (id, "publicKey", algorithm, "createdAt")
  VALUES (gen_random_uuid()::TEXT, p_public_key, p_algorithm, NOW())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.ensure_signing_key(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ensure_signing_key(TEXT, TEXT) TO watchtower_app;
