# Watchtower — Copilot Instructions

Watchtower is a **multi-tenant compliance platform for Microsoft 365**. It runs automated CIS / NIST audits with GitOps-driven custom logic, serving MSPs managing hundreds of tenants and enterprises managing legally-isolated business units — from the same codebase, with the same data model.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, tRPC v11) |
| Language / runtime | TypeScript, Bun |
| Database | PostgreSQL 18, Prisma 7 |
| Authentication | Better Auth (Organization plugin) |
| Background jobs | Inngest (stateful workflow orchestration) |
| Object storage | Garage S3 (evidence vault) |
| Execution engine | Bun + esbuild (Core), dynamic TS + Zod (Plugin) |
| Infrastructure | Docker Compose on a single NUC |
| Billing | Stripe (metered) |
| Observability | OpenTelemetry (planned) |

## Architecture

The data model is built around a Workspace → Scope → Tenant hierarchy with three-layer isolation (application permission check → explicit SQL filters → Postgres RLS). Findings are durable (persist across scans), scans are ephemeral.

## Non-Negotiable Rules

These apply to ALL code in this repository. Violating any of them is a security bug:

1. **Never instantiate `new PrismaClient()` directly.** Always use the RLS-wrapped client from tRPC context (`ctx.db`).
2. **Every tRPC mutation requires an `idempotencyKey` (UUID v4) in its input.**
3. **Every tRPC procedure starts with `ctx.requirePermission("...", { scopeId })`** — after the existence check, before any mutation.
4. **Use Zod for every input and output schema.** No `z.any()`, no `z.unknown()`.
5. **Use cursor-based pagination, not offset.** Standard shape: `{ cursor, limit }` in, `{ items, nextCursor }` out.
6. **Audit log entries are written for every state-changing mutation, in the same database transaction as the change itself.**
7. **Soft-delete via `deletedAt` for Workspace, Scope, and Tenant.** Filter `deletedAt: null` on every query unless explicitly accessing archived data.
8. **No secrets in `NEXT_PUBLIC_` env vars.** No raw `Error` throws in tRPC routers — always use `TRPCError` with Layer 2 code.
9. **Every error uses both Layer 1 (tRPC transport code) and Layer 2 (`WATCHTOWER:DOMAIN:CODE` in `cause.errorCode`).**
10. **Never pass client input directly to Prisma `where` clauses.** Filters and sort fields are allowlisted.

## Key Documentation

- `docs/Architecture.md` — System architecture, dual-engine model, trust boundaries
- `docs/API-Conventions.md` — tRPC router conventions, error handling, pagination, idempotency
- `docs/Code-Conventions.md` — Audit logging, soft-delete, secrets, testing, vendor adapters
- `README.md` — Quick start, repo structure, PR checklist

## Available Agents

Specialized agents are available in `.github/agents/` for domain-specific tasks. Use them when working in their areas of expertise. Key agents include:

- **typescript-pro** — TypeScript patterns with Bun, tRPC, Prisma, and Zod
- **backend-developer** — tRPC routers, Inngest workers, Bun runtime
- **api-designer** — tRPC v11 procedure design following API-Conventions.md
- **nextjs-developer** — Next.js 16 App Router with Server Components
- **postgres-pro** — PostgreSQL 18 with RLS, Prisma 7, multi-tenant isolation
- **docker-expert** — Docker Compose, Garage S3, development infrastructure
- **security-auditor** — Multi-tenant security, RLS, defense-in-depth
- **compliance-auditor** — CIS/NIST compliance, audit log integrity
- **code-reviewer** — Watchtower coding conventions enforcement
- **debugger** — Bun, Prisma, tRPC, RLS debugging
- **qa-expert** — Unit, integration, and E2E testing tiers
- **performance-engineer** — PostgreSQL, Bun, query optimization
- **documentation-engineer** — Architecture docs, ADRs, API documentation
- **refactoring-specialist** — Safe code transformations
- **architect-reviewer** — Multi-tenant architecture decisions
- **devops-engineer** — CI/CD, Docker Compose, deployment
- **database-administrator** — PostgreSQL 18, migrations, RLS policies
- **frontend-designer** — Premium dashboard UI, design tokens, component registries, Phase 3 UI foundation
- **fullstack-developer** — End-to-end feature development across the stack
