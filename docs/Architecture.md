# Watchtower — System Architecture

Watchtower is a multi-tenant compliance platform for Microsoft 365. It runs automated CIS / NIST audits with GitOps-driven custom logic, and is designed to scale from a single MSP managing hundreds of tenants to a large enterprise managing a handful of legally-isolated entities — from the same codebase, with the same data model.

This document captures the *current* system design. If something here doesn't match the code, the code is right and this document is wrong — please update it. The goal is to keep the *why* close to the *what*.

For the rationale behind individual schema decisions, see [`Schema-Design-Notes.md`](./Schema-Design-Notes.md).

## 1. The three commitments

Three commitments shape almost everything else in the system.

**Findings are durable, scans are ephemeral.** A scan is an *event* that produces observations, which update findings. Findings persist across scans and carry the lifecycle (open, acknowledged, accepted_risk, resolved, etc.). This inversion — most compliance tools get it backwards and treat each scan as a snapshot — is the structural commitment that makes mute, accept-risk, and drift detection work cleanly instead of being bolted on later.

**API-first, data-driven, expandable.** Checks are *data* — rows in a table identified by a stable slug, not code baked into the engine. Frameworks are data. The mappings between them are data. The engine *executes* checks but doesn't *know about* frameworks. Adding a new framework or check is a database operation, not a deploy.

**Three customer shapes, one model.** A 600-tenant MSP and a 5-legal-entity enterprise are not the same product, but they share a schema. The Workspace → Scope → Tenant hierarchy with a per-workspace `scopeIsolationMode` is what lets one platform serve both without becoming two products.

## 2. Hierarchy: Workspace → Scope → Tenant

```
Workspace          ← billing + commercial unit (one per Watchtower contract)
  └─ Scope         ← isolation boundary (the MSP's "group", the enterprise's "entity")
       └─ Tenant   ← one connected M365 environment
```

**Workspace** is the top-level container. It maps 1:1 with a Better Auth Organization. It owns billing, the customer-facing brand, top-level admins, the API tokens. There is exactly one Workspace per customer relationship.

**Scope** is the isolation and grouping layer. It is where RBAC and data isolation actually live. Every Tenant belongs to exactly one Scope. Every Finding, Scan, and Observation carries `scopeId` (denormalized for RLS). For the MSP, a Scope is a customer segment or a team's book of business. For the enterprise, each legal entity is a Scope.

The thing the schema gets right that a flat model gets wrong is that **Scope behavior is configurable per Workspace** via `scopeIsolationMode`:

- `SOFT` (the MSP default) — workspace admins see across all scopes by default. Scopes are convenient grouping, not hard boundaries.
- `STRICT` (the enterprise default) — scopes are hard isolation boundaries even for workspace admins. Cross-scope reads require explicit, audited elevation.

The schema is identical for both modes; the policy enforcement is at the application middleware layer.

**Tenant** is one connected M365 environment. Encrypted credentials live here, never returned by default queries, decrypted only inside the connector adapter at execution time.

## 3. The dual-engine model

> ⚠️ **Open design question.** The split below is the current plan, but we have not yet measured whether the cold-start win justifies maintaining two execution paths. A single-engine collapse is on the table if measurement doesn't justify the split.

To balance speed and flexibility, the execution engine is split:

- **Core Engine (default policies):** pre-compiled into a high-speed binary using `esbuild`, executed natively via Bun. Contains immutable CIS / NIST foundations. Targets <50ms cold start and is aggressively tree-shaken.
- **Plugin Engine (custom policies):** dynamically loads TypeScript files synced from customer GitHub repositories. Validated at runtime via Zod to prevent crashes and enforce type safety. Treated as an untrusted execution surface — sandboxing strategy is TBD and is the most security-critical open question in the system.

## 4. Permission-first RBAC

The RBAC system is permission-first, not role-first. The catalog of permissions is the source of truth, and roles are bags of permissions. Customers can create custom roles; the four built-in system roles (Owner, Admin, Compliance Officer, Auditor) are presets.

Key properties:

- **The application code never checks `user.role == "admin"`.** It always checks `user.can("findings:mute", { scopeId })`. Adding a new role is a UI form, not a code change.
- **Permissions have a `scopeApplicability`** field (`WORKSPACE_ONLY`, `SCOPE_ONLY`, `BOTH`) that prevents customers from composing nonsensical roles.
- **Locked permissions** (`assignableToCustomRoles: false`) cannot appear in custom roles. They are held only by the Owner system role: `workspace:delete`, `workspace:transfer_ownership`, `members:remove_owner`, `roles:edit_system_roles`.
- **The Owner role holds every permission in the catalog.** This is enforced by the seed runner's validator — a future maintainer who adds a permission and forgets to grant it to Owner gets caught immediately.
- **Permissions are additive across roles.** A user with both Auditor and "Healthcare Lead" gets the union of both permission sets. There is no concept of negative permissions or deny rules.

A user is a member of a Workspace via a `Membership`. The Membership is optionally bound to a single Scope (or null for workspace-wide). Each Membership carries one or more Roles. Memberships are scoped, roles are not — the same Role can be reused across many Scopes.

## 5. Multi-tenant isolation: defense in depth

Watchtower has three independent layers of cross-tenant isolation. None of them substitutes for the others.

**Layer 1: Application permission check.** Every tRPC procedure starts with `ctx.requirePermission("...", { scopeId })`. This is the *primary* boundary. It uses the user's permission context — loaded once per request and cached — to decide whether the operation is allowed at all.

**Layer 2: Explicit SQL filters.** Every query that touches a workspace-scoped table includes `WHERE workspaceId = ? AND scopeId IN (...)` clauses derived from the user's accessible scopes. The composite index on `Finding(workspaceId, scopeId, status, severityRank DESC, firstSeenAt)` is shaped to serve exactly this access pattern.

**Layer 3: Postgres Row-Level Security.** Every workspace-scoped table has RLS enabled and `FORCE ROW LEVEL SECURITY` set. The runtime application connects as `watchtower_app` (NOBYPASSRLS) and sets `app.current_workspace_id` and `app.current_user_scope_ids` as session-local variables (`SET LOCAL`) at the start of each request. The RLS policies use these via `app.row_visible(workspaceId, scopeId)` helpers in a dedicated `app` schema.

**Why all three:** Layer 1 catches operations that shouldn't happen at all. Layer 2 makes the operations that *should* happen efficient. Layer 3 catches the bug where Layer 2 was forgotten — the day a developer writes `findOne({ where: { id } })` and omits the workspace filter, RLS returns zero rows instead of someone else's data.

The session variables are *intentionally* `SET LOCAL`. They live for the duration of the transaction only and never leak across pooled connections. A pooled connection that retained workspace context across requests would be a cross-tenant leak waiting to happen.

## 6. Database role separation

Watchtower uses two distinct Postgres roles, with strict privilege separation:

| Role | BYPASSRLS | DDL | Used by |
|---|---|---|---|
| `watchtower_migrate` | ✓ | ✓ | `prisma migrate deploy`, the seed runner — deployment-time only |
| `watchtower_app` | ✗ | ✗ | The application at runtime — every user request goes through this |

`watchtower_migrate` exists for ~30 seconds during a deploy. The application code at runtime constructs its own `PrismaClient` with an explicit `PrismaPg` adapter pointing at `DATABASE_URL` (the runtime URL), never reading `prisma.config.ts`. The CLI's config file is irrelevant to the application's connection.

A future Phase 0 hardening: an application startup check that runs `SELECT current_user` and refuses to start if the result isn't `watchtower_app`. This catches the bug where the runtime URL accidentally points at the migrate role in production.

## 7. The audit log

Two tables, deliberately:

- **`AuditEvent`** — hash-chained, Ed25519-signed, transactional with the operational change. For state-changing actions.
- **`AuditAccessLog`** — high-volume, batched into Merkle roots committed back to `AuditEvent`. For optional read auditing.

Append-only enforcement is *three layers*, not one:

1. **Role separation.** The runtime role has `INSERT` and `SELECT` grants only. No `UPDATE`, no `DELETE`, no `TRUNCATE`. Application code physically cannot mutate audit rows.
2. **Triggers.** A `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger on each audit table raises an exception. This catches grant misconfiguration. `TRUNCATE` is included because it bypasses row-level triggers — without listing it explicitly, an attacker (or buggy migration) could wipe the table.
3. **Row-level security.** The same RLS visibility model as the operational tables, scoped per-workspace. Independent of append-only enforcement.

Each event carries `prevHash`, `rowHash`, `chainSequence`, `signature`, and `signingKeyId`. The chain is per-workspace (avoiding a global write bottleneck) and gap-free via the monotonic `chainSequence` (a second tamper signal beyond the chain hash). The Ed25519 private key never lives in the database; only the public key does, in `AuditSigningKey`. Signing keys can rotate without breaking historical verification.

The honest claim Watchtower can make: **tamper-evident, cryptographically signed, append-only at the database layer, independently verifiable.** The honest claim Watchtower cannot make: tamper-*proof*. Anyone with sufficient database access can always destroy data — the right framing is "any tampering is provably detectable."

External anchoring (posting periodic chain digests to a third party) is the next layer beyond Phase 0 and closes the rogue-DBA gap. Not shipped on day one because no current customer requires it.

## 8. Data flow: tenant scan lifecycle

1. **Trigger.** A user initiates a scan from the UI, or a scheduled cron fires the event.
2. **Permission check.** The tRPC handler calls `ctx.requirePermission("scans:trigger", { scopeId })`. Rejected requests return 404 (deliberately, not 403 — "this resource exists but you can't see it" is itself a leak).
3. **Idempotency check.** The mutation requires an `idempotencyKey` (UUID v4) in its input. The middleware writes to `IdempotencyKey` at the start of the transaction; duplicate keys return the cached response without re-executing.
4. **Dispatch.** The handler emits an `audit/trigger` event to **Inngest**.
5. **Stateful execution.** Inngest retrieves tenant credentials from the secrets vault, then invokes the **Bun worker** (Core Engine + GitOps sync for the Plugin Engine). The worker queries **Microsoft Graph** via parallelized batch requests (HTTP/2 multiplexing). Policies are evaluated against the fetched data in-memory.
6. **Storage.** Each policy result becomes an `Observation` (append-only). Observations update existing `Finding` rows or create new ones, keyed on `(tenantId, checkSlug)`. State transitions (open → acknowledged, resolved → regression, etc.) are written transactionally. Audit events for any state changes are written in the same transaction, with hash chain and signature.
7. **Billing.** Inngest reports the completed scan count to **Stripe** for metered billing, keyed off the Workspace ID.

## 9. Trust boundaries

- **Public internet → Next.js API.** Authenticated via Better Auth sessions, scoped to a Workspace. Rate-limited per role.
- **Next.js → Inngest → Bun worker.** Internal network only.
- **Bun worker → Microsoft Graph.** Outbound HTTPS using per-tenant encrypted credentials, decrypted only inside the connector adapter.
- **GitHub (customer policy repos) → Plugin Engine.** Untrusted code path. All inputs Zod-validated; sandboxing strategy TBD.
- **Bun worker → Garage S3.** Internal network; pre-signed URLs issued for direct browser uploads.
- **Audit log signing key → Bun worker.** Mounted from the secrets vault as a file, never present in env vars or the database.

## 10. Infrastructure

> **Resolved design question.** Earlier drafts considered Docker Swarm vs k3s for orchestration. The current decision is **plain Docker Compose**, deployed initially to a single NUC. Multi-node orchestration is deferred until a real need emerges.

The platform is designed to scale horizontally across commodity hardware, but currently deploys to a single NUC for both development and early production.

- **Traefik** handles external ingress, SSL termination, and routing.
- **PostgreSQL 18** as the operational database. Owned by `watchtower_migrate`, accessed at runtime by `watchtower_app`.
- **Garage S3** for the evidence vault. Garage was chosen specifically because it targets geo-distributed, small-cluster, commodity-hardware deployments — the NUC scenario. (MinIO was the other option but is no longer maintained as of February 2026.)
- **Inngest** for stateful workflow orchestration. Self-hosted via the dev server in development; cloud or self-hosted in production.

**Redis is intentionally not in the stack.** Inngest handles queueing and durable state, Postgres handles sessions and application data, and no current workload justifies a separate cache or pub/sub layer. If a concrete need emerges (live dashboards with high-fanout subscriptions, for example), it can be added back with a documented role.

**When to revisit Compose vs Kubernetes:**
- A second NUC and a real failover requirement
- A hire whose mental model is k8s and Docker feels foreign
- A customer who insists on receiving Helm charts rather than a compose file
- Genuine need for zero-downtime rolling deploys with health-gated traffic shifting

None of those are true today. Plain Compose is right for now, with eyes open about the trigger conditions.

## 11. Components and connections

```
                        Public internet
                             │
                          Traefik
                             │
                    Next.js 16 (App Router + tRPC v11)
                    │           │           │
                    ▼           ▼           ▼
              Better Auth   Inngest      Stripe
              (Org session) (Workflow)   (Metered billing)
                                │
                                ▼
                        Bun worker (dual-engine)
                   ┌────────────┴────────────┐
                   ▼                         ▼
              Core Engine             Plugin Engine
              (esbuild binary,        (Dynamic TS,
               CIS / NIST,            Zod-validated,
               <50ms cold start)      sandbox TBD)
                   │                         │
                   ▼                         ▼
              Microsoft Graph API      GitHub App
              (HTTP/2 batch,           (Customer policy repos)
               parallelized)
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   PostgreSQL 18           Garage S3
   (Scan results,          (Evidence vault,
    findings, audit log,    replicated)
    permissions, RBAC)

                   Observability layer
                   (Logs · metrics · traces, OpenTelemetry)
```

## 12. Open design questions

These are decisions we have explicitly *not* made and are tracking. They will become ADRs in `docs/decisions/` (template TBD).

| Question | Status | Notes |
|---|---|---|
| Dual-engine split worth the complexity? | Open | Targeting <50ms cold start. Need to measure actual cold start frequency in production before committing. |
| Plugin Engine sandboxing strategy | Open | Most security-critical question in the system. Options: isolated-vm, separate Bun process with seccomp, Firecracker microVMs. |
| Cross-org analytics path | Designed, not built | Separate `analytics` schema with BYPASSRLS role. Aggregates only — never row-level findings. |
| GDPR right-to-erasure for audit log actor IDs | Open | Crypto-shredding (encrypted actor IDs, deletion via key destruction) is the likely answer. ADR pending. |
| External anchoring of audit chain | Deferred | Phase 1+, only if a customer's regulatory regime demands it. |
| Observation table partitioning | Deferred | Range partitioning by month. Not needed until volume justifies it. |
| Connector abstraction beyond Graph | Designed, not built | `Check.graphScopes` will become a generic `dataSource` field with a connector registry when a second connector is added. |

## 13. What each phase delivers

To make the milestones explicit:

### Phase 0 — Database foundation

- **20 tables, 13 enum types, ~50 indexes** — the full entity model from `schema.prisma`
- **5 helper functions** in the `app` schema for RLS evaluation
- **2 audit append-only triggers** on `AuditEvent` and `AuditAccessLog`
- **RLS enabled** on Finding, AuditEvent, AuditAccessLog, Tenant
- **The `current_check` materialized view**, populated and indexed
- **Two-role security boundary** between `watchtower_migrate` and `watchtower_app`, verified by `has_table_privilege`
- **41 permissions** in the catalog, with **6 locked** to system roles
- **4 system roles** (Owner, Admin, Compliance Officer, Auditor) with the Owner-holds-everything invariant enforced
- **Hash-chained, Ed25519-signed audit log infrastructure** (signing key generation deferred to runtime)

### Phase 1.0 — Application foundation

- **Monorepo structure** with Bun workspaces (`packages/*`, `apps/*`)
- **`@watchtower/db`** — Singleton PrismaClient, `withRLS()` transaction wrapper, startup validation, soft-delete
- **`@watchtower/errors`** — Two-layer error code catalog (31 codes: 8 domains, Layer 1 transport + Layer 2 business)
- **`apps/web`** — tRPC v11 skeleton with `protectedProcedure` and `permission.list` router
- **ADR-001** — Monorepo structure decisions

### Phase 1.1 — Authentication & middleware

- **`@watchtower/auth`** — Better Auth with Organization plugin, `resolveSession(headers)`
- **tRPC middleware chain** — session resolution → permission loading (SOFT/STRICT) → RLS wiring via `ctx.db`
- **`workspace` router** — `get`, `updateSettings` (with idempotencyKey, audit log)
- **`scope` router** — `list` (cursor-paginated), `get` (scope-derived permission check)
- **ADR-002** — Better Auth + Organization plugin decisions
- **Three-layer isolation chain** — application permission + explicit SQL filters + Postgres RLS

### Phase 1.2 — Infrastructure hardening

- **Idempotency middleware** — check/store cycle with SHA-256 request hashing, duplicate key detection, 2xx/4xx caching
- **Audit hash chain** — Ed25519 signing, per-workspace chains, gap-free `chainSequence`, genesis block (`GENESIS`)
- **In-memory rate limiter** — 3 tiers (query 100/60s, mutation 30/60s, auth 10/60s), `X-RateLimit-*` headers
- **`workspace.updateSettings` refactored** — full idempotency + audit chain integration
- **Startup validation tests** — audit key path, env vars, role identity

### Phase 2.0 — Core entity routers

- **8 new routers** (11 total) covering all core entities:
  - `tenant` — CRUD + soft-delete, scope-filtered, credential exclusion, duplicate M365 tenant guard
  - `member` — workspace membership lifecycle, owner removal protection, role assignment
  - `role` — custom role management, system role immutability guard, locked permission validation
  - `check` — read-only catalog with severity/source filters
  - `framework` — read-only compliance framework catalog
  - `finding` — flagship query with 5 allowlisted filters, 4 state transition procedures (acknowledge, mute, acceptRisk, resolve)
  - `evidence` — read-only append-only data, excludes large payloads from list
  - `audit` — read-only hash-chain viewer, excludes tamper-evidence fields
- **Every mutation** follows: idempotency → existence → permission → mutation + audit in same tx → save idempotency
- **1,038 passing tests** — 231 new convention tests across 14 categories

### Phase 2.1 — Scan router & vendor adapter boundary

- **`scan` router** (12 routers total):
  - `list` — cursor-paginated with 4 allowlisted filters (scopeId, tenantId, status, triggeredBy)
  - `get` — existence-first, permission-after, excludes `inngestRunId`
  - `trigger` — idempotent manual scan creation, tenant existence + soft-delete guard, duplicate active scan guard (`ALREADY_RUNNING`)
  - `cancel` — state guard (only PENDING/RUNNING), sets `CANCELLED` + `finishedAt`, records `previousStatus` in audit
- **`@watchtower/adapters` package** — vendor adapter boundary (ADR-003):
  - `VendorAdapter<TDataSources>` interface — the contract all vendor connectors implement
  - `GraphDataSources` type map — 10 data source types for Microsoft Graph
  - `AdapterError` — structured error with `kind` (transient, rate_limited, insufficient_scope, credentials_invalid, permanent) and Watchtower error code mapping
  - `AdapterConfig` / `AdapterResult<T>` — adapter input/output contracts
- **ADR-003** — Vendor Adapter Boundary decisions (credential decryption, error translation, test seam)
- **1,084 passing tests** — 46 new scan convention tests across §1–§15

### Not yet delivered

Application code: Graph adapter implementation, scan execution pipeline, Inngest worker, GitHub App for plugin sync, UI, Stripe billing integration, API token management, webhook/SIEM integrations.

## 14. The tests that hold the schema honest

Some invariants are not enforceable at the database level — they have to be enforced by tests in CI. These are the ones worth committing to early, listed in the design notes and to be implemented as part of Phase 0 completion:

- **RLS coverage test** — query `pg_class` and `pg_policy` to assert that every table carrying `workspaceId` has RLS enabled and at least one policy.
- **Cross-tenant isolation test** — for every read endpoint, simulate two workspaces and verify that workspace A cannot see workspace B's data, even with hand-crafted requests.
- **Audit append-only test** — attempt UPDATE, DELETE, and TRUNCATE on `AuditEvent` and `AuditAccessLog` from the runtime role; verify all three are rejected.
- **Permission catalog invariants** — Owner contains every permission, locked permissions exist only in system roles, all system role permissions reference real catalog entries.
- **Hash chain verification test** — insert events, verify the chain end-to-end. Then insert concurrently from two writers and verify the chain is still intact.

These tests are not Phase 0 deliverables. They're Phase 0 *expectations* — the foundation isn't done until they exist.
