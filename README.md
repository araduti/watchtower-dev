![Ampliosoft Logo](watchtower.png)
# Watchtower

Watchtower is a multi-tenant compliance platform for Microsoft 365. It runs automated CIS / NIST audits with GitOps-driven custom logic, serving everyone from MSPs managing hundreds of tenants to enterprises managing legally-isolated business units — from the same codebase, with the same data model.

Watchtower treats compliance as structured knowledge, not a product feature. Frameworks, checks, controls, and the mappings between them are rows in a database — a new CIS version is a migration, a customer's internal policy is a pull request against their own GitHub repo. Built-in checks and customer-authored checks are the same kind of object, executed by the same engine. For the full design principles, see [`PRINCIPLES.md`](./PRINCIPLES.md).

This document is for contributors. For the system design, see [`docs/Architecture.md`](./docs/Architecture.md). For schema rationale, see [`docs/Schema-Design-Notes.md`](./docs/Schema-Design-Notes.md). For API conventions, see [`docs/API-Conventions.md`](./docs/API-Conventions.md). For broader code conventions (audit logging, soft-delete, testing, vendor adapters), see [`docs/Code-Conventions.md`](./docs/Code-Conventions.md).

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
bun run db:migrate          # applies pending migrations via watchtower_migrate role
bun run db:generate         # regenerates the Prisma client
bun run db:seed             # seeds permission catalog + system roles

# 5. Start the app
bun run dev
```

The web app runs at `http://localhost:3000`. The Inngest dev UI runs at `http://localhost:8288`.

If anything in steps 3–4 fails, the most likely cause is something else listening on port 5432 (typically a native Postgres installation). Run `sudo lsof -i :5432` to check, and stop the conflicting service before retrying.

## Repo structure

```
watchtower-dev/
├── apps/
│   ├── web/                       # Next.js 16 app (App Router, tRPC v11, dashboard UI)
│   │   └── src/
│   │       ├── app/dashboard/     # Dashboard pages (findings, scans, tenants, members, …)
│   │       ├── components/        # React components (compliance, dashboard, shared)
│   │       ├── lib/               # tRPC client, utilities
│   │       └── server/            # tRPC routers (13 routers), middleware, error handling
│   └── worker/                    # Bun-based worker (scan pipeline, plugin evaluation)
├── packages/
│   ├── adapters/                  # Vendor adapter boundary (Graph types, AdapterError)
│   ├── auth/                      # Better Auth configuration, Org plugin, session resolver
│   ├── db/                        # Prisma client wrapper, RLS-aware proxy
│   ├── engine/                    # Compliance engine — evaluator registry, assertions
│   ├── errors/                    # Two-layer error code catalog (zero dependencies)
│   ├── sandbox/                   # Firecracker microVM lifecycle manager for plugin sandboxing
│   ├── scan-pipeline/             # Inngest functions (execute-scan, handle-cancellation)
│   └── ui/                        # Shared Tailwind / shadcn components (button, card, dialog, …)
├── prisma/
│   ├── schema.prisma              # Entity model — single source of truth
│   ├── migrations/                # Versioned migrations (init, RLS, grants, policies, renames)
│   └── seeds/
│       ├── permissions.ts         # Permission catalog + system roles
│       └── index.ts               # Seed runner (dry-run, --only, --force)
├── tests/                         # Test suites organised by phase
│   ├── factories/                 # Test factory helpers
│   ├── phase0/ … phase2.2/       # Convention + integration tests
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
│   ├── Code-Conventions.md        # Audit log, soft-delete, testing, vendor adapters
│   └── decisions/                 # Architecture Decision Records
│       ├── 001-monorepo-structure.md
│       ├── 002-better-auth-integration.md
│       ├── 003-vendor-adapter-boundary.md
│       ├── 003-plugin-evaluator-contract.md   # (shares 003 prefix — pre-dates ADR renumber)
│       └── 004-single-engine-firecracker-sandbox.md
├── docker-compose.dev.yml         # Local infra (Postgres 18, Garage S3, Inngest)
├── docker-compose.prod.yml        # Production stack (planned)
├── prisma.config.ts               # Prisma 7 config — points at MIGRATE URL
├── PRINCIPLES.md                  # Platform vision and design principles
├── .env.example                   # Canonical env var list
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, tRPC v11) |
| Language / runtime | TypeScript, Bun |
| Database | PostgreSQL 18, Prisma 7 |
| Authentication | Better Auth (Organization plugin) |
| Background jobs | Inngest (stateful workflow orchestration) |
| Object storage | Garage S3 (evidence vault) |
| Execution engine | Single Bun engine, Firecracker microVMs (plugin sandbox) |
| UI components | Tailwind CSS 4, shadcn/ui (Radix primitives) |
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
| `WATCHTOWER_SANDBOX_MODE` | Plugin sandbox: `production` (Firecracker) or `dev` (in-process) |

The two database URLs are deliberate. `DATABASE_URL` is used by the application at runtime and connects as a role with no DDL rights and no RLS bypass. `DATABASE_MIGRATE_URL` is used by Prisma's CLI and the seed runner, connects as a role with full DDL rights and BYPASSRLS, and exists only for ~30 seconds during deploys. **Mixing these up is the worst kind of security bug a future contributor can introduce — application code that connects with the migrate URL silently disables every isolation guarantee in the system.**

## Common tasks

```bash
# Development
bun run dev                       # Start the Next.js app (Turbopack)
bun run build                     # Production build

# Database
bun run db:migrate                # Apply pending migrations (uses MIGRATE URL)
bun run db:migrate:dev --name x   # Create a new migration from schema changes
bun run db:generate               # Regenerate the Prisma client
bun run db:studio                 # Browse the database in a web UI

# Seeds
bun run db:seed -- --dry-run      # Validate seed data without writing
bun run db:seed                   # Apply permission catalog + system roles
bun run db:seed -- --only=permissions  # Run a single seeder
bun run db:seed -- --force        # Required in production

# Testing
bun run test                      # Run all tests (vitest)
bun run test:unit                 # Pure logic, no I/O
bun run test:watch                # Watch mode

# Type checking
bun run typecheck                 # tsc --noEmit

# Full reset (development only — wipes the database)
bun run db:reset                  # docker compose down -v && up -d
sleep 15
bun run db:migrate
bun run db:generate
bun run db:seed
```

## Development conventions

The full conventions are in [`docs/Code-Conventions.md`](./docs/Code-Conventions.md) and [`docs/API-Conventions.md`](./docs/API-Conventions.md). The non-negotiables every contributor needs to know on day one:

- **Never instantiate `new PrismaClient()` directly.** Always use the RLS-wrapped client from tRPC context (`ctx.db`). Bypassing RLS is a critical security violation.
- **Every tRPC mutation requires an `idempotencyKey` (UUID v4) in its input.** Missing key returns 400.
- **Every tRPC procedure starts with `ctx.requirePermission("...", { scopeId })`.** Authorization checks happen before any SQL.
- **Use Zod for every input and output schema.** No `z.any()`, no `z.unknown()`.
- **Use cursor-based pagination, not offset.** Standard shape: `{ cursor, limit }` in, `{ items, nextCursor }` out.
- **Audit log entries are written for every state-changing mutation, in the same database transaction as the change itself.**
- **Soft-delete via `deletedAt` for Workspace, Scope, and Tenant.** Audit log foreign keys use `onDelete: Restrict` — you cannot cascade-destroy compliance evidence.
- **Filter `deletedAt: null` on every query** unless the operation explicitly accesses archived data.
- **No secrets in env vars marked `NEXT_PUBLIC_`.** Browser-accessible variables must use that prefix; secrets must never use it.
- **No raw `Error` throws in tRPC routers.** Always use `TRPCError` with a hierarchical Layer 2 code in `cause.errorCode`.

## Contributing

Branch naming: `feat/`, `fix/`, `chore/`, `docs/` plus a short description.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.

### PR checklist

Every PR must satisfy these before review:

- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes
- [ ] No new `new PrismaClient()` instantiations outside the RLS-wrapped client
- [ ] No secrets, credentials, or tokens in logs or API responses
- [ ] Audit log entries written for any new state-changing mutations
- [ ] Workspace-scoped queries filter on `deletedAt IS NULL` (or document why not)
- [ ] New tables carrying `workspaceId` have RLS enabled
- [ ] Schema changes have a corresponding migration committed
- [ ] Architectural decisions have a corresponding ADR in `docs/decisions/`
- [ ] New permissions added to the catalog include a description, category, and `scopeApplicability`
- [ ] If a permission is added, the Owner system role is updated to include it (the seed validator will catch this anyway, but better to do it intentionally)

### Testing

```bash
bun run test                      # All tests
bun run test:unit                 # Pure logic, no I/O
bun run test:watch                # Watch mode
```

Integration tests require the dev stack to be running (`docker compose -f docker-compose.dev.yml up -d`). Use the factory helpers in `tests/factories/` — never hard-code `workspaceId` or `scopeId` values.

## Architecture at a glance

Watchtower's data model is built around a few opinionated commitments:

- **Findings are durable, scans are ephemeral.** A scan is an event that produces evidence, which updates findings. Findings persist across scans and carry the full lifecycle (open, acknowledged, accepted_risk, resolved). Most compliance tools get this backwards.
- **Three customer shapes, one model.** A 600-tenant MSP and a 5-legal-entity enterprise share the same Workspace → Scope → Tenant hierarchy. The difference is a single configuration value (`scopeIsolationMode`) per workspace.
- **Permission-first RBAC.** The catalog of permissions is the source of truth. Roles are bags of permissions. Customers define their own. Four built-in system roles cover ~80% of needs.
- **Defense in depth on isolation.** Application permission check + explicit SQL filters + Postgres RLS. Three independent layers, each catching a different class of bug.
- **Audit log is tamper-evident, not tamper-proof.** Hash chain + Ed25519 signatures + database-enforced append-only. Any tampering is provably detectable.
- **API-first.** The web UI is one client among many. The API is the product.
- **Self-hosted by design.** The platform deploys where the customer needs it — on their hardware, in their jurisdiction, inside their network boundary.

For the full picture, read [`docs/Architecture.md`](./docs/Architecture.md). For schema rationale, read [`docs/Schema-Design-Notes.md`](./docs/Schema-Design-Notes.md).

## Status

**Phase 0** (database foundation) — ✅ complete
Schema (20+ models, 13 enums, ~50 indexes), RLS, audit log infrastructure, permission catalog (41 permissions, 4 system roles), two-role security boundary, dev infrastructure.

**Phase 1.0** (application foundation) — ✅ complete
Monorepo structure, `@watchtower/db` (RLS-aware Prisma wrapper), `@watchtower/errors` (two-layer error catalog), tRPC v11 skeleton.

**Phase 1.1** (authentication & middleware) — ✅ complete
`@watchtower/auth` (Better Auth + Organization plugin), session resolution, permission loading, RLS wiring, `workspace` and `scope` routers.

**Phase 1.2** (infrastructure hardening) — ✅ complete
Idempotency middleware, audit hash chain (Ed25519), rate limiter (3 tiers), startup validation.

**Phase 2.0** (core entity routers) — ✅ complete
`tenant`, `member`, `role`, `check`, `framework`, `finding`, `evidence`, `audit` routers — 11 routers, 1,038 passing tests.

**Phase 2.1** (scan router & vendor adapter boundary) — ✅ complete
`scan` router, `@watchtower/adapters` (vendor adapter contract), 12 routers, 1,084 passing tests.

**Phase 2.2** (scan pipeline & Inngest integration) — ✅ complete
`@watchtower/scan-pipeline` (Inngest orchestration), Graph adapter (AES-256-GCM, OAuth, backoff), `@watchtower/sandbox` (Firecracker microVMs), 1,226 passing tests.

**Phase 3.0** (UI foundation) — 🔨 in progress
Next.js 16 dashboard, `@watchtower/ui` component library (shadcn/ui), dashboard pages for findings, scans, tenants, members, roles, frameworks, audit, and settings.

**Next:** Completing Phase 3.0, then Phase 3.1+ (real-time updates, evidence uploads, compliance reporting).

For the full roadmap, see [`docs/Architecture.md`](./docs/Architecture.md).

## License

TBD.
