#!/bin/bash
# =============================================================================
# Watchtower — Postgres role bootstrap
# =============================================================================
#
# Runs ONCE on first container start, when /var/lib/postgresql/data is empty.
# The Postgres image executes every script in /docker-entrypoint-initdb.d/
# in alphabetical order, after the database cluster is initialized but before
# accepting external connections.
#
# This script creates the two roles that Watchtower's RLS architecture
# depends on:
#
#   watchtower_app       NOBYPASSRLS  the runtime role used by the application
#   watchtower_migrate   BYPASSRLS    the role used by `prisma migrate deploy`
#
# Both roles are created BEFORE the application or migration tooling tries
# to connect, which is what makes 001_rls_setup.sql applicable.
#
# After this script runs, the application connects with one URL and the
# migration tooling connects with another. Both are configured in .env.
#
# To re-bootstrap: `docker compose down -v` to wipe the data volume, then
# bring it back up. The script runs again on the fresh volume.
#
# =============================================================================

set -e

# The required environment variables come from docker-compose.dev.yml.
# Bail loudly if either is missing — silent fallback would create roles
# with empty passwords, which is the worst possible failure mode.
: "${WATCHTOWER_APP_PASSWORD:?WATCHTOWER_APP_PASSWORD is required}"
: "${WATCHTOWER_MIGRATE_PASSWORD:?WATCHTOWER_MIGRATE_PASSWORD is required}"

echo "▸ Watchtower role bootstrap starting..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Create the application schema used by RLS helper functions.
  -- The runtime and migration roles get USAGE on this schema in
  -- 001_rls_setup.sql; here we only ensure it exists.
  CREATE SCHEMA IF NOT EXISTS app;

  -- ----- Runtime role: watchtower_app -----
  -- Used by the application at request time. Cannot bypass RLS, cannot run
  -- DDL, cannot mutate audit tables. The most security-critical role in
  -- the system.
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watchtower_app') THEN
      CREATE ROLE watchtower_app
        WITH LOGIN
             NOBYPASSRLS
             PASSWORD '${WATCHTOWER_APP_PASSWORD}';
      RAISE NOTICE 'Created role watchtower_app';
    ELSE
      ALTER ROLE watchtower_app WITH PASSWORD '${WATCHTOWER_APP_PASSWORD}';
      RAISE NOTICE 'Updated password for existing role watchtower_app';
    END IF;
  END
  \$\$;

  -- ----- Migration role: watchtower_migrate -----
  -- Used only by \`prisma migrate deploy\` and the seed runner. Has DDL
  -- rights and BYPASSRLS so migrations can run unhindered. NEVER used by
  -- the application at request time.
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watchtower_migrate') THEN
      CREATE ROLE watchtower_migrate
        WITH LOGIN
             BYPASSRLS
             CREATEDB
             PASSWORD '${WATCHTOWER_MIGRATE_PASSWORD}';
      RAISE NOTICE 'Created role watchtower_migrate';
    ELSE
      ALTER ROLE watchtower_migrate WITH PASSWORD '${WATCHTOWER_MIGRATE_PASSWORD}';
      RAISE NOTICE 'Updated password for existing role watchtower_migrate';
    END IF;
  END
  \$\$;

  -- ----- Database ownership -----
  -- The migration role owns the database so it can run DDL freely.
  -- The application role gets explicit grants in 001_rls_setup.sql.
  ALTER DATABASE watchtower OWNER TO watchtower_migrate;
  ALTER SCHEMA public OWNER TO watchtower_migrate;
  ALTER SCHEMA app    OWNER TO watchtower_migrate;

  -- ----- CONNECT privilege -----
  -- Both roles need to be able to open a connection to the database itself.
  -- (Table-level grants come from 001_rls_setup.sql.)
  GRANT CONNECT ON DATABASE watchtower TO watchtower_app;
  GRANT CONNECT ON DATABASE watchtower TO watchtower_migrate;
EOSQL

echo "✓ Watchtower role bootstrap complete."
echo "  - watchtower_app    (NOBYPASSRLS, runtime)"
echo "  - watchtower_migrate (BYPASSRLS, DDL + seeds)"
echo "  Next: apply prisma/migrations/001_rls_setup.sql with the migrate role."
