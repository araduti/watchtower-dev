# Watchtower — Code Conventions

This document is the rulebook for writing **any code** in the Watchtower repo. Its companion is [`API-Conventions.md`](./API-Conventions.md), which covers the narrow slice between an HTTP request and the database — tRPC routers, input/output schemas, pagination, errors. Everything else lives here: audit logging, soft-delete, secrets, testing, vendor adapters, RSC patterns, the PR checklist.

If a convention is relevant only inside a router, it belongs in `API-Conventions.md`. If it applies equally to a worker job, a seed script, or a React Server Component, it belongs here. When in doubt, this document is the broader net; prefer it.

Like `API-Conventions.md`, this file is forward-looking in places. Some rules describe code that doesn't exist yet (Phase 1+). Those rules are still binding — they are the contract the code will be written against, not a description of what's already there.

## 1. Audit log discipline

The audit log is the single most load-bearing piece of the system. It's the reason compliance evidence is trustworthy, the reason a disputed change can be reconstructed months later, and the reason tampering is provably detectable. Treat it with the seriousness that implies.

**Every state-changing mutation writes an audit log entry in the same database transaction as the change itself.** Not "after" — *in the same transaction*. If the mutation commits, the audit entry commits. If the mutation rolls back, so does the audit entry. There is no code path that produces a state change without a matching audit row.

```typescript
await ctx.db.$transaction(async (tx) => {
  const updated = await tx.finding.update({
    where: { id: input.findingId },
    data: { status: "MUTED", mutedUntil: input.mutedUntil },
  });
  await tx.auditEvent.create({
    data: {
      workspaceId: ctx.session.workspaceId,
      scopeId: finding.scopeId,
      actorUserId: ctx.session.userId,
      action: "finding.mute",
      resourceType: "Finding",
      resourceId: updated.id,
      metadata: { reason: input.reason, mutedUntil: input.mutedUntil },
      traceId: ctx.traceId,
    },
  });
});
```

Rules:

- **Use the same `tx` handle** for the state change and the audit write. A second `ctx.db.auditLog.create()` outside the transaction is a bug, even if it looks equivalent.
- **`action` is `domain.verb`**, matching the tRPC procedure name where one exists. Grep-friendliness matters.
- **`metadata` is structured JSON**, not free text. Searchable fields go in columns; context goes in metadata.
- **Never log secrets in `metadata`.** No tokens, no credentials, no raw evidence blobs. If a field is sensitive on the way in, it's sensitive on the way out.
- **Audit entries are append-only.** There is no update path, no delete path, no "oops" edit. A corrected entry is a *new* entry that references the original. Database triggers enforce this; don't try to work around them.
- **The hash chain and Ed25519 signature are computed by the database trigger**, not by application code. Application code supplies the business fields; the infrastructure handles tamper-evidence. See `Architecture.md` §7 for the chain construction.

Read-only operations don't write audit entries. If you find yourself writing an audit entry for a query, the procedure probably isn't actually read-only — re-examine what state it's mutating.

## 2. Soft-delete and `onDelete: Restrict`

Three tables soft-delete via `deletedAt`: **Workspace**, **Scope**, **Tenant**. Everything else either hard-deletes or doesn't delete at all.

The reason for the asymmetry is that these three are the carriers of compliance context. Hard-deleting a tenant would orphan every finding, scan, and evidence artifact that ever referenced it — including the ones you legally have to retain. Soft-deleting preserves the referential chain while hiding the row from normal queries.

Rules:

- **Every query on `Workspace`, `Scope`, or `Tenant` filters `deletedAt: null`** unless it is explicitly an archival operation. The Prisma middleware adds this filter by default; don't disable it without a comment explaining why.
- **Audit log foreign keys use `onDelete: Restrict`.** You cannot cascade-destroy compliance evidence, even by accident, even in tests. If a test needs a clean slate, it uses a dedicated workspace and soft-deletes it at the end — it does not `TRUNCATE auditLog`.
- **"Deleting" a workspace sets `deletedAt` and disables logins** but leaves every row it owns in place. A background job 90 days later may purge derived data (caches, ephemeral scan artifacts) but never the audit log, never the findings, never the evidence pointers.
- **Unique constraints that include soft-deletable rows need a partial index:** `UNIQUE (workspaceId, slug) WHERE deletedAt IS NULL`. Without the predicate, a restored row collides with itself.

If you are adding a new table and reach for `deletedAt`, stop and justify it. The three soft-deletable tables are load-bearing for compliance history; everything else should earn the complexity before taking it on.

## 3. Secrets handling

The rules are short and absolute.

- **Secrets never live in the repo.** Not in `.env` (which is gitignored), not in seed fixtures, not in test files, not in comments, not in example snippets.
- **`.env.example` contains placeholders only** — never real credentials, not even for throwaway dev services.
- **`NEXT_PUBLIC_*` variables are browser-accessible and therefore public.** Anything prefixed this way is readable by every visitor to the site. Putting a secret behind `NEXT_PUBLIC_` is a disclosure, full stop.
- **Secrets loaded from files, not env vars, where possible.** The Ed25519 audit signing key and the GitHub App private key are referenced by *path* (`AUDIT_SIGNING_KEY_PATH`), not by value. Env vars show up in process listings, crash dumps, and error reporters; files don't.
- **Never log a secret.** Not on error, not on debug, not "just this once." Logging middleware redacts known field names (`password`, `token`, `secret`, `authorization`, `apiKey`) but you should not rely on the allowlist — write code that doesn't hand secrets to the logger in the first place.
- **Tenant credentials are encrypted at rest** with a workspace-scoped DEK. Decryption happens at the vendor adapter boundary (§6), never in a router, never in a React component.
- **No secrets in tRPC output schemas.** Recapitulating a rule from `API-Conventions.md` §3 because it's the most common way to leak one: if a Prisma object has a sensitive field, never `return finding` raw — project explicitly.

The startup validator (Phase 1) will refuse to boot if it detects `DATABASE_URL` pointing at a BYPASSRLS role. Similar checks will land for other high-risk misconfigurations. If you add a new secret, add a validator for it.

## 4. Frontend and RSC patterns

Watchtower's web app is Next.js 16 App Router with tRPC v11. The frontend rules are mostly about keeping trust boundaries visible.

- **Server Components are the default.** Reach for `"use client"` only when you need interactivity, browser APIs, or a hook that genuinely can't run on the server.
- **Never import the Prisma client into a Server Component.** Data access goes through tRPC even on the server — the React Server Component calls the server-side tRPC caller, which goes through the same permission and RLS middleware a browser call would. Bypassing the tRPC layer bypasses the permission check, which is never acceptable.
- **Never pass a secret or internal ID to a Client Component as a prop.** Props crossing the server/client boundary are serialized into the page payload and visible in view-source. If a Client Component needs data, it fetches it through tRPC like any other client.
- **Error boundaries catch rendering errors, not business errors.** A `FORBIDDEN` from tRPC is a business error — handle it in the component with a useful message. An unexpected render crash is a rendering error — let the boundary catch it.
- **No client-side permission checks for gating security-relevant UI.** Hiding a button in the browser is a UX affordance, not an enforcement mechanism. Enforcement is the server's job, always. The button can be hidden *and* the procedure can reject the call — both, not either.
- **Forms submit through tRPC mutations**, not through Next.js server actions, until we have a compelling reason otherwise. The reason is uniformity: one code path for idempotency, one for audit, one for error handling. Two paths means bugs on the less-used one.

## 5. Testing

Three tiers, run in order of cost:

| Tier | What it covers | Where it runs |
|---|---|---|
| **Unit** | Pure logic, no I/O, no database | In-process, parallel |
| **Integration** | Full request lifecycle against the Docker dev stack | Against a real Postgres with migrations and seeds |
| **E2E** | Browser-driven full user flows | Against a running web app |

Rules:

- **Never hard-code `workspaceId`, `scopeId`, `tenantId`, or `userId`.** Use the factory helpers in `tests/factories/`. A hard-coded ID works until someone runs two tests in parallel against the same database, and then it fails in a way that's nearly impossible to debug.
- **Integration tests run with the RLS-enabled app role**, not the migrate role. A test that only passes with BYPASSRLS is testing the wrong thing — the whole point of RLS is that it's active during normal operation.
- **Every mutation test asserts on the audit log.** If a test exercises a state-changing procedure and doesn't check that an audit entry was written, the test is incomplete.
- **Tests must clean up the rows they create**, scoped to a test-specific workspace. Do not truncate shared tables. Do not hard-delete from `AuditEvent` or `AuditAccessLog` (you can't anyway — see §2). Soft-delete the test workspace at the end; the background purge handles the rest.
- **No network calls in unit or integration tests.** Vendor adapters are mocked at the adapter boundary, not lower. See §6.
- **Flaky tests are bugs, not inconveniences.** A test that fails one time in twenty is worse than a missing test — it trains reviewers to ignore red. Fix it or delete it; don't retry it.

Run the tiers:

```bash
bun run test:unit
bun run test:integration   # requires docker compose -f docker-compose.dev.yml up -d
bun run test:e2e
```

## 6. Vendor adapter patterns

Microsoft Graph is the first vendor connector; others will follow. Every vendor connector lives behind an **adapter** — a thin module that owns credential decryption, request construction, retry policy, and error translation. Nothing outside the adapter knows a vendor's SDK exists.

Rules:

- **Credentials are decrypted at the adapter boundary and nowhere else.** A router never sees a plaintext token. A worker job calls `graphAdapter.forTenant(tenantId)`, which loads the encrypted credential, decrypts it using the workspace-scoped DEK, and returns a client bound to that tenant. The plaintext never escapes the adapter's closure.
- **Vendor errors are translated into Watchtower errors at the boundary.** A `GraphError: 429` becomes `WATCHTOWER:VENDOR:RATE_LIMITED`; a `GraphError: 403` becomes `WATCHTOWER:VENDOR:INSUFFICIENT_SCOPE`; an unknown 5xx becomes `WATCHTOWER:VENDOR:GRAPH_ERROR` and is logged with full detail server-side. Callers upstream of the adapter handle Watchtower error codes, never vendor SDK exceptions.
- **Retries live inside the adapter.** Exponential backoff, jitter, respect for `Retry-After`. Upstream code assumes the adapter either returns a result or throws a translated error — it does not re-attempt.
- **Rate limiting is per `(workspaceId, tenantId)`.** See `API-Conventions.md` §11. The adapter is where this is enforced for vendor calls.
- **Adapters are the test seam for integration tests.** Mock `graphAdapter`, not `fetch`. Tests that stub HTTP are testing the wrong layer and break every time the SDK changes.
- **No vendor SDK imports outside `packages/adapters/`.** Lint rules will enforce this once the package exists. The purpose is that a future vendor swap (or SDK upgrade) touches one directory.

## 7. The PR checklist

This list is also in `README.md`. It's repeated here because the README version is for newcomers orienting to the repo, and this version is for contributors opening a PR. Keep them in sync.

Before requesting review, every PR must satisfy:

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run test` passes (all relevant tiers)
- [ ] No new `new PrismaClient()` instantiations outside the RLS-wrapped client
- [ ] No secrets, credentials, or tokens in logs, API responses, audit metadata, or test fixtures
- [ ] Audit log entries written for every new state-changing mutation, in the same transaction as the change
- [ ] Workspace-scoped queries filter `deletedAt: null` (or a comment explains why not)
- [ ] New tables carrying `workspaceId` have RLS enabled and a tested policy
- [ ] Schema changes have a corresponding migration committed
- [ ] tRPC changes follow `API-Conventions.md` (Zod schemas, cursor pagination, idempotency key, `TRPCError` with Layer 2 code)
- [ ] Architectural decisions have a corresponding ADR in `docs/decisions/`
- [ ] New permissions added to the catalog include description, category, and `scopeApplicability`
- [ ] If a permission is added, the Owner system role is updated to include it
- [ ] New vendor calls go through an adapter, not direct SDK use from a router or job

A PR that fails any of these is not ready for review. Self-review the list before assigning a reviewer — it's faster than a round-trip.

## 8. What's not in this document

The counterpart to `API-Conventions.md` §14:

- **tRPC router patterns** (procedure naming, Zod at the API boundary, idempotency, pagination, error shape) → `API-Conventions.md`.
- **Schema rationale** (why Findings are durable, why soft-delete is limited to three tables, why the permission catalog is the source of truth) → `Schema-Design-Notes.md`.
- **System architecture** (Core vs Plugin engine, audit log hash chain construction, isolation model, three customer shapes) → `Architecture.md`.
- **Environment variable reference** → `README.md` and `.env.example`.
- **Migration authoring and RLS policy style** → `prisma/migrations/` conventions, captured in a future `Migration-Conventions.md` if and when it earns its keep.

The division of labor: `API-Conventions.md` is "how do I write a router." This document is "how do I write any code in this repo." `Schema-Design-Notes.md` is "why is the schema the way it is." `Architecture.md` is "how do the pieces fit together." Four documents, four questions, minimal overlap.
