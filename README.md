![Ampliosoft Logo](watchtower.png)
# Watchtower

Watchtower is a multi-tenant compliance platform for Microsoft 365. It runs automated CIS / NIST audits with GitOps-driven custom logic, serving everyone from MSPs managing hundreds of tenants to enterprises managing legally-isolated business units — from the same codebase, with the same data model.

This document is for contributors. For the system design, see [`Architecture.md`](./Architecture.md). For schema rationale, see [`Schema-Design-Notes.md`](./Schema-Design-Notes.md). For API conventions, see [`API-Conventions.md`](./API-Conventions.md).

## Quick start

```bash
# 1. Clone and install
git clone <repo-url> watchtower-dev
cd watchtower-dev
bun install

# 2. Set up environment
cp .env.example .env
mkdir -p secrets
openssl genpkey -algorithm Ed25519 -out secrets/audit-signing-key.pem
chmod 600 secrets/audit-signing-key.pem

# 3. Bring up the dev infrastructure
docker compose -f docker-compose.dev.yml up -d
sleep 15  # wait for the Postgres role bootstrap to complete

# 4. Apply schema, generate client, and seed
bunx prisma migrate deploy
bunx prisma generate
bun run db:seed

# 5. Start the app (available from Phase 3.0)
# bun run dev
```

The web app runs at `http://localhost:3000`. The Inngest dev UI runs at `http://localhost:8288`.

If anything in steps 3–4 fails, the most likely cause is something else listening on port 5432 (typically a native Postgres installation). Run `sudo lsof -i :5432` to check, and stop the conflicting service before retrying.

## Repo structure

```
watchtower-dev/
├── apps/                          # application code
│   ├── web/                       # Next.js 16 app, tRPC server, UI
│   └── worker/                    # planned: Bun-based worker (Core + Plugin engines)
├── packages/                      # shared packages
│   ├── adapters/                  # Vendor adapter boundary (Graph types, AdapterError)
│   ├── auth/                      # Better Auth configuration, Org plugin, session resolver
│   ├── db/                        # Prisma client wrapper, RLS-aware proxy
│   ├── errors/                    # Two-layer error code catalog (zero dependencies)
│   ├── engine/                    # Compliance engine — evaluator registry, built-in evaluators
│   ├── sandbox/                   # Firecracker microVM lifecycle manager for plugin sandboxing
│   └── ui/                        # planned: Shared Tailwind / shadcn components
├── prisma/
│   ├── schema.prisma              # Entity model — single source of truth
│   ├── migrations/                # Versioned migrations
│   │   ├── <ts>_init/             # Tables, enums, indexes
│   │   └── <ts>_rls_setup/        # RLS policies, triggers, helpers, mat views
│   └── seeds/
│       ├── permissions.ts         # Permission catalog + system roles
│       └── index.ts               # Seed runner (dry-run, --only, --force)
├── docker/
│   ├── postgres/init/
│   │   └── 01-create-roles.sh     # Role bootstrap, runs once on first init
│   └── garage/
│       └── garage.toml            # Garage S3 config for the evidence vault
├── secrets/                       # gitignored — Ed25519 audit key, GitHub App key
├── docs/
│   ├── Architecture.md            # System architecture
│   ├── Schema-Design-Notes.md     # Why the schema is the way it is
│   ├── API-Conventions.md         # tRPC, errors, pagination, RBAC patterns
│   └── decisions/                 # Architecture Decision Records
│       ├── 001-monorepo-structure.md
│       └── 002-better-auth-integration.md
├── docker-compose.dev.yml         # Local infra (Postgres, Garage, Inngest)
├── docker-compose.prod.yml        # planned: production stack
├── prisma.config.ts               # Prisma 7 config — points at MIGRATE URL
├── .env.example                   # Canonical env var list
├── package.json
├── tsconfig.json
└── README.md
```

The `apps/` and `packages/` directories contain the application foundation built across Phase 1.0 and 1.1. The database foundation (schema, migrations, RLS, seeds, bootstrap infrastructure) was established in Phase 0.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, tRPC v11) |
| Language / runtime | TypeScript, Bun |
| Database | PostgreSQL 18, Prisma 7 |
| Authentication | Better Auth (Organization plugin) |
| Background jobs | Inngest (stateful workflow orchestration) |
| Object storage | Garage S3 (evidence vault) |
| Execution engine | Bun (single engine), Firecracker microVMs (plugin sandbox) |
| Infrastructure | Docker Compose on a single NUC |
| Billing | Stripe (metered) |
| Observability | OpenTelemetry (planned) |

## Environment variables

Copy `.env.example` to `.env` and fill in any blanks. The defaults in `.env.example` are safe for local development only — production values come from a secrets vault, never from a file in the repo.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime connection (`watchtower_app` role, NOBYPASSRLS) |
| `DATABASE_MIGRATE_URL` | Migration / seed connection (`watchtower_migrate` role, BYPASSRLS) |
| `WATCHTOWER_APP_PASSWORD` | Password for the runtime role (used by the bootstrap script) |
| `WATCHTOWER_MIGRATE_PASSWORD` | Password for the migrate role (used by the bootstrap script) |
| `BETTER_AUTH_SECRET` | Session signing secret |
| `BETTER_AUTH_URL` | Base URL for auth callbacks |
| `GARAGE_S3_ENDPOINT` | Garage S3 endpoint |
| `GARAGE_S3_ACCESS_KEY` | Garage access key |
| `GARAGE_S3_SECRET_KEY` | Garage secret key |
| `GARAGE_S3_BUCKET` | Evidence vault bucket name |
| `INNGEST_EVENT_KEY` | Inngest routing key |
| `INNGEST_SIGNING_KEY` | Inngest signing key |
| `AUDIT_SIGNING_KEY_PATH` | Path to Ed25519 private key (file, not value) |
| `STRIPE_SECRET_KEY` | Stripe API key for metered billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `GITHUB_APP_ID` | GitHub App for syncing customer policy repos |
| `GITHUB_APP_PRIVATE_KEY_PATH` | Path to GitHub App private key (file, not value) |

The two database URLs are deliberate. `DATABASE_URL` is used by the application at runtime and connects as a role with no DDL rights and no RLS bypass. `DATABASE_MIGRATE_URL` is used by Prisma's CLI and the seed runner, connects as a role with full DDL rights and BYPASSRLS, and exists only for ~30 seconds during deploys. **Mixing these up is the worst kind of security bug a future contributor can introduce — application code that connects with the migrate URL silently disables every isolation guarantee in the system.** When we add startup validation in Phase 1, the application will refuse to boot if it detects the wrong role.

## Common tasks

```bash
# Database
bunx prisma migrate deploy        # Apply pending migrations
bunx prisma migrate dev --name x  # Create a new migration from schema changes
bunx prisma generate              # Regenerate the Prisma client
bunx prisma studio                # Browse the database in a web UI

# Seeds
bun run db:seed -- --dry-run      # Validate seed data without writing
bun run db:seed                   # Apply permission catalog + system roles
bun run db:seed -- --only=permissions  # Run a single seeder
bun run db:seed -- --force        # Required in production

# Reset (development only — wipes the database)
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
sleep 15
bunx prisma migrate deploy
bunx prisma generate
bun run db:seed
```

## Development conventions

The full conventions doc is `API-Conventions.md`. The non-negotiables every contributor needs to know on day one:

- **Never instantiate `new PrismaClient()` directly.** Always use the RLS-wrapped client from tRPC context. Bypassing RLS is a critical security violation.
- **Every tRPC mutation requires an `idempotencyKey` (UUID v4) in its input.** Missing key returns 400.
- **Every tRPC procedure starts with `ctx.requirePermission("...", { scopeId })`.** Authorization checks happen before any SQL.
- **Use Zod for every input and output schema.** No `z.any()`, no `z.unknown()`.
- **Use cursor-based pagination, not offset.** Standard shape: `{ cursor, limit }` in, `{ items, nextCursor }` out.
- **Audit log entries are written for every state-changing mutation, in the same database transaction as the change itself.**
- **Soft-delete via `deletedAt` for Workspace, Scope, and Tenant.** Audit log foreign keys use `onDelete: Restrict` — you cannot cascade-destroy compliance evidence.
- **Filter out `deletedAt: null` on every query** unless the operation explicitly accesses archived data.
- **No secrets in env vars marked `NEXT_PUBLIC_`.** Browser-accessible variables must use that prefix; secrets must never use it.
- **No raw `Error` throws in tRPC routers.** Always use `TRPCError` with a hierarchical Layer 2 code in `cause.errorCode`.

## Contributing

Branch naming: `feat/`, `fix/`, `chore/`, `docs/` plus a short description.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.

### PR checklist

Every PR must satisfy these before review:

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run test` passes
- [ ] No new `new PrismaClient()` instantiations outside the RLS-wrapped client
- [ ] No secrets, credentials, or tokens in logs or API responses
- [ ] Audit log entries written for any new state-changing mutations
- [ ] Workspace-scoped queries filter on `deletedAt IS NULL` (or document why not)
- [ ] New tables carrying `workspaceId` have RLS enabled
- [ ] Schema changes have a corresponding migration committed
- [ ] API changes have a corresponding entry in `API-Reference.md` (when that doc exists)
- [ ] Architectural decisions have a corresponding ADR in `docs/decisions/`
- [ ] New permissions added to the catalog include a description, category, and `scopeApplicability`
- [ ] If a permission is added, the Owner system role is updated to include it (the seed validator will catch this anyway, but better to do it intentionally)

### Testing tiers

```bash
bun run test:unit          # Pure logic, no I/O
bun run test:integration   # Against the Docker dev stack
bun run test:e2e           # Full request lifecycle
```

Integration tests require the dev stack to be running. Use the factory helpers in `tests/factories/` — never hard-code `workspaceId` or `scopeId` values.

## Architecture at a glance

Watchtower's data model is built around a few opinionated commitments:

- **Findings are durable, scans are ephemeral.** A scan is an event that produces observations, which update findings. Findings persist across scans and carry the full lifecycle (open, acknowledged, accepted_risk, resolved). Most compliance tools get this backwards.
- **Three customer shapes, one model.** A 600-tenant MSP and a 5-legal-entity enterprise share the same Workspace → Scope → Tenant hierarchy. The difference is a single configuration value (`scopeIsolationMode`) per workspace.
- **Permission-first RBAC.** The catalog of permissions is the source of truth. Roles are bags of permissions. Customers define their own. Four built-in system roles cover ~80% of needs.
- **Defense in depth on isolation.** Application permission check + explicit SQL filters + Postgres RLS. Three independent layers, each catching a different class of bug.
- **Audit log is tamper-evident, not tamper-proof.** Hash chain + Ed25519 signatures + database-enforced append-only. Any tampering is provably detectable.
- **API-first.** The web UI is one client among many. The API is the product.

For the full picture, read `Architecture.md`. For schema rationale, read `Schema-Design-Notes.md`.

## License

TBD.

## Status

**Phase 0** (database foundation) is complete: schema (20 models, 13 enums, ~50 indexes), RLS, audit log infrastructure, permission catalog (41 permissions, 4 system roles), two-role security boundary, dev infrastructure.

**Phase 1.0** (application foundation) is complete:
- ✅ Monorepo structure with Bun workspaces (`packages/*`, `apps/*`)
- ✅ `@watchtower/db` — RLS-aware Prisma client wrapper (singleton client, `withRLS()`, startup validation, soft-delete extension)
- ✅ `@watchtower/errors` — Two-layer error code catalog (31 codes, zero dependencies)
- ✅ `apps/web` — tRPC v11 skeleton with protected procedure middleware and first router (`permission.list`)
- ✅ ADR-001: monorepo structure decisions

**Phase 1.1** (authentication & middleware) is complete:
- ✅ `@watchtower/auth` — Better Auth with Organization plugin, session resolution via `resolveSession(headers)`
- ✅ tRPC middleware — session resolution from Better Auth cookies/headers
- ✅ tRPC middleware — permission loading from database (Membership → Role → Permission chain, SOFT/STRICT isolation)
- ✅ tRPC middleware — RLS wiring via `ctx.db` (three-layer isolation chain complete)
- ✅ `workspace` router — `workspace.get`, `workspace.updateSettings` (with idempotencyKey, audit log, permission check)
- ✅ `scope` router — `scope.list` (cursor-paginated), `scope.get` (scope-derived permission check)
- ✅ ADR-002: Better Auth + Organization plugin decisions

**Phase 1.2** (infrastructure hardening) is complete:
- ✅ Idempotency middleware — check/store cycle with SHA-256 request hashing, duplicate key detection
- ✅ Audit hash chain — Ed25519 signing, per-workspace chains, gap-free sequence numbers, genesis block
- ✅ In-memory rate limiter — 3 tiers (query: 100/60s, mutation: 30/60s, auth: 10/60s), `X-RateLimit-*` headers
- ✅ `workspace.updateSettings` refactored to use full idempotency + audit chain
- ✅ Startup validation tests

**Phase 2.0** (core entity routers) is complete:
- ✅ `tenant` router — `list` (cursor-paginated, scope-filtered), `get`, `create` (idempotency + audit + duplicate guard), `update`, `softDelete`
- ✅ `member` router — `list`, `get`, `invite` (duplicate guard), `remove` (owner protection), `updateRole`
- ✅ `role` router — `list`, `get`, `create` (locked permission validation), `update` (system role guard), `delete`
- ✅ `check` router — `list` (severity/source filters), `get` — read-only (checks are data)
- ✅ `framework` router — `list`, `get` — read-only (frameworks are data)
- ✅ `finding` router — `list` (flagship query with severity/status/scope/visibility filters), `get`, `acknowledge`, `mute`, `acceptRisk`, `resolve` — each state transition as a separate procedure
- ✅ `evidence` router — `list` (scope-filtered, excludes raw data), `get` — read-only (append-only data)
- ✅ `audit` router — `list` (chain-ordered, excludes tamper-evidence fields) — read-only
- ✅ 11 routers registered in `_app.ts` (was 3)
- ✅ 1,038 passing tests (775 existing + 231 Phase 2.0 convention tests + 32 auto-detected)

**Phase 2.1** (scan router & vendor adapter boundary) is complete:
- ✅ `scan` router — `list` (4 allowlisted filters), `get`, `trigger` (idempotent, duplicate active scan guard), `cancel` (state guard, PENDING/RUNNING only)
- ✅ `@watchtower/adapters` package — `VendorAdapter<TDataSources>` interface, `GraphDataSources` type map (10 sources), `AdapterError` with retry semantics
- ✅ ADR-003: Vendor Adapter Boundary — credential decryption, error translation, test seam patterns
- ✅ 12 routers registered in `_app.ts`
- ✅ 1,084 passing tests (1,038 existing + 46 new scan convention tests across §1–§15)

**Phase 2.2** (scan pipeline & Inngest integration) is complete:
- ✅ `@watchtower/scan-pipeline` package — Inngest client, typed events, function registry
- ✅ `execute-scan` Inngest function — 4-step orchestration (transition → collect → store-evidence → finalize) with `onFailure` handler
- ✅ `handle-cancellation` Inngest function — graceful scan cancellation via event-driven coordination
- ✅ Inngest serve route (`/api/inngest`) for function discovery and event-driven invocation
- ✅ Scan router wired to emit Inngest events on `trigger` and `cancel`
- ✅ Graph adapter — AES-256-GCM credential decryption, client-credentials OAuth, exponential backoff, per-tenant concurrency limiting, OData pagination
- ✅ `@watchtower/sandbox` package — Firecracker microVM config, plugin schema validation, dev-mode fallback
- ✅ ADR-004: Single-engine collapse + Firecracker sandboxing
- ✅ 1,226 passing tests (1,084 existing + 81 Phase 2.2 convention tests + 61 sandbox tests)

**Next:** Phase 3.0 (UI foundation).

For the full roadmap, see `Architecture.md` section 12 ("Open design questions") and section 13.
