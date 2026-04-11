# Watchtower — API Conventions

This document is the rulebook for writing tRPC routers in Watchtower. It is forward-looking — at the time of writing, no production routers exist yet — but every convention here is the **contract for future code**. Once a convention ships in a real router, it becomes part of the public API and cannot be changed without a versioned breaking change.

If something in code doesn't match what's written here, the document is right and the code is wrong — please update the code, not the document. The companion to this file is `Code-Conventions.md` (planned), which covers conventions that apply to *any* code in the repo (audit logging, secrets, soft-delete, testing, the PR checklist). This file is specifically for **the layer between an HTTP request and the database**.

## 1. Router organization

Routers are organized **by business domain**, not by HTTP verb or by technical layer. Planned routers:

`workspace` · `scope` · `tenant` · `member` · `role` · `permission` · `scan` · `finding` · `evidence` · `check` · `framework` · `plugin` · `report` · `audit` · `integration` · `apiToken`

Domain boundaries follow the schema's natural grouping. A new domain gets a new router file; a new operation in an existing domain gets a new procedure on that router. Don't create cross-domain "service" routers — if a single user action touches two domains, the router for the *primary* domain calls helper functions, not other routers.

## 2. Procedure naming

`domain.verb` or `domain.verbNoun`, camelCase.

- **Queries are read-only.** Naming: `list`, `get`, `getById`, `search`, `count`.
- **Mutations always modify state.** Use domain-specific verbs when CRUD doesn't fit. Prefer `mute` / `acceptRisk` / `resolve` / `acknowledge` over `update` for state-machine transitions.
- **Never abbreviate.** `listSubscriptions`, not `listSubs`.

State-machine transitions get *one procedure per transition*, not a generic `updateStatus` that takes a `newStatus` parameter. Each transition has different validation, different audit semantics, different permissions. Collapsing them into a generic update procedure forces the validation logic into a switch statement and makes the audit log harder to query.

## 3. Input and output schemas

Every input and output is a Zod schema. No exceptions, no `z.any()`, no `z.unknown()`.

```typescript
export const findingMuteInput = z.object({
  idempotencyKey: z.string().uuid(),
  findingId: z.string().cuid(),
  reason: z.string().min(1).max(500).optional(),
  mutedUntil: z.coerce.date().optional(),
});
```

Rules:

- IDs use `z.string().cuid()`. Not `z.string()`, not `z.string().uuid()`.
- Optional fields use `.optional()`, never `z.union([..., z.undefined()])`.
- Enums use `z.nativeEnum(PrismaEnum)` referencing the generated Prisma enum.
- Dates use `z.coerce.date()` to accept ISO strings from JSON clients.
- **Sensitive fields never appear in output schemas.** Tenant credentials, signing keys, raw evidence — none returned even when the user has permission to see the parent record. Define explicit `select` projections at the Prisma layer.
- Output schemas are exhaustive. Every field returned to the client is validated on the way out. This catches the bug where a router accidentally leaks an internal field by returning a raw Prisma object.

## 4. Protected procedures and `ctx.db`

Every procedure is `protectedProcedure`. There is no `publicProcedure` in Watchtower — even read-only catalogs require an authenticated session, because every API call must be traceable to a workspace.

The middleware that wraps every procedure does five things, in order:

1. Resolves the Better Auth session and extracts `userId` and `workspaceId`.
2. Loads the user's permission context for this workspace (cached per request).
3. Sets `app.current_workspace_id` and `app.current_user_scope_ids` as Postgres session variables via `SET LOCAL` inside the request transaction.
4. Constructs an RLS-aware Prisma proxy and exposes it as `ctx.db`.
5. Threads a `traceId` through to logs, Inngest events, and audit log entries.

The only allowed database access from inside a procedure is via `ctx.db`. **Never instantiate `new PrismaClient()` directly inside a router.** Bypassing RLS is a critical security violation. Lint rules will catch this; reviewers will catch this; it's a hard rule with no exceptions.

```typescript
// Wrong
const prisma = new PrismaClient();
const findings = await prisma.finding.findMany({ ... });

// Right
const findings = await ctx.db.finding.findMany({ ... });
```

## 5. Permission checks

Every procedure begins with `ctx.requirePermission(...)`. This is the chokepoint — there is no other code path that decides whether a user is allowed to do something.

```typescript
export const findingMute = protectedProcedure
  .input(findingMuteInput)
  .output(findingMuteOutput)
  .mutation(async ({ input, ctx }) => {
    const finding = await ctx.db.finding.findUnique({
      where: { id: input.findingId },
      select: { scopeId: true, status: true, tenantId: true },
    });
    if (!finding) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Finding not found.",
        cause: { errorCode: "WATCHTOWER:FINDING:NOT_FOUND" },
      });
    }
    await ctx.requirePermission("findings:mute", { scopeId: finding.scopeId });
    // ... mutation logic ...
  });
```

Critical details:

- **The permission check happens *after* the existence check.** If a user tries to mute a finding that doesn't exist *and* doesn't belong to a scope they can access, returning `NOT_FOUND` instead of `FORBIDDEN` prevents leaking the existence of resources in scopes the user can't see. Watchtower returns 404 for resources outside the user's accessible scopes — never 403.
- **The scope is derived from the resource**, not from input. Read the row first, then check permission against that derived scope. A client-controlled `scopeId` in input would let a malicious caller bypass the check.
- **Read endpoints don't pre-check per-scope.** For `list`, the check is `ctx.requirePermission("findings:read")` (no scope), then the SQL query filters by `scopeId IN (user's accessible scopes)`. The query is the enforcement.
- **Workspace-wide actions use no scope.** `ctx.requirePermission("workspace:edit_settings")` checks against workspace-level memberships only. Enforced by the permission's `scopeApplicability` field being `WORKSPACE_ONLY`.

## 6. Tenant scoping (defense in depth)

The rule for every query that touches a workspace-scoped table:

**Verify the resource belongs to the user's accessible scopes. Never rely on database foreign keys or client-provided IDs alone.**

Three layers, each catching a different class of bug:

1. **Application permission check** (Layer 1 — primary).
2. **Explicit `WHERE` filters in the SQL** (Layer 2 — efficiency + intent).
3. **Postgres RLS** (Layer 3 — safety net).

RLS catches the bug where Layer 2 was forgotten — the day a developer writes `findOne({ where: { id } })` without a workspace filter, RLS returns zero rows instead of someone else's data. But code should still be written *as if RLS didn't exist*. Don't rely on the safety net to do the work of the primary check.

For mutations, the row's `workspaceId` must match `ctx.session.workspaceId`, and its `scopeId` must be in the user's accessible scopes, and the RLS policy's `WITH CHECK` clause rejects the operation if either fails.

## 7. Error handling

Two-layer error model. Every error has both layers; missing either is a bug.

**Layer 1 — tRPC transport code.** HTTP-semantic, used by clients to decide retry behavior and rendering: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`.

**Layer 2 — hierarchical business code in `cause.errorCode`.** Format: `WATCHTOWER:DOMAIN:CODE`. The programmatic key clients switch on; clients must never parse `message` for logic.

```typescript
throw new TRPCError({
  code: "CONFLICT",
  message: "This finding has already been muted.",
  cause: {
    errorCode: "WATCHTOWER:FINDING:ALREADY_MUTED",
    recovery: { action: "REVIEW_FINDING", label: "View finding", params: { findingId: finding.id } },
  },
});
```

Rules:

- **Both layers always set.** Missing `cause.errorCode` is a bug.
- **`message` is safe for end users.** No stack traces, no SQL, no internal IDs the client doesn't already know.
- **Error codes are a stable contract.** Once shipped, an error code is forever. Deprecate by no longer throwing it; never rename or remove it.
- **Vendor errors are wrapped.** When the Microsoft Graph adapter throws, the router catches and re-throws as `WATCHTOWER:VENDOR:GRAPH_ERROR`. Raw upstream errors never reach the client.
- **Recovery hints are optional but encouraged.** Shape: `{ action, label, params }`. The client uses these to render actionable buttons in error states.

### Representative error codes (Phase 0)

The full catalog will live in `apps/web/src/server/errors.ts` once routers exist and grow with each new router. Starting set:

| Code | Layer 1 | Description |
|---|---|---|
| `WATCHTOWER:AUTH:SESSION_EXPIRED` | `UNAUTHORIZED` | The session is no longer valid; re-authenticate. |
| `WATCHTOWER:AUTH:INSUFFICIENT_PERMISSION` | `NOT_FOUND` | Action requires a permission the user doesn't have. Returned as 404 to avoid leaking existence. |
| `WATCHTOWER:FINDING:NOT_FOUND` | `NOT_FOUND` | Finding doesn't exist or isn't visible to the user. |
| `WATCHTOWER:FINDING:ALREADY_MUTED` | `CONFLICT` | The finding is already in MUTED visibility. |
| `WATCHTOWER:FINDING:ACCEPTANCE_MISSING_EXPIRATION` | `BAD_REQUEST` | `acceptRisk` requires `acceptanceExpiresAt`. |
| `WATCHTOWER:TENANT:CREDENTIALS_INVALID` | `PRECONDITION_FAILED` | Stored credentials no longer authenticate to Microsoft Graph. |
| `WATCHTOWER:SCAN:ALREADY_RUNNING` | `CONFLICT` | A scan is already in progress for this tenant. |
| `WATCHTOWER:PLUGIN:CHECK_NOT_APPROVED` | `PRECONDITION_FAILED` | A plugin check must be approved before it can run. |
| `WATCHTOWER:VENDOR:GRAPH_ERROR` | `INTERNAL_SERVER_ERROR` | Unrecoverable error from Microsoft Graph; details logged server-side. |
| `WATCHTOWER:RATE_LIMIT:EXCEEDED` | `TOO_MANY_REQUESTS` | The user has exceeded their per-minute rate limit. |

## 8. Idempotency

**Every mutation requires an `idempotencyKey: z.string().uuid()` in its input.** Missing key returns `BAD_REQUEST` with `WATCHTOWER:REQUEST:MISSING_IDEMPOTENCY_KEY`.

The middleware writes the key to `IdempotencyKey` at the start of the request transaction, scoped per workspace. On a duplicate key:

- **2xx response cached** → return cached response without re-executing.
- **4xx response cached** → return cached error. The client must regenerate the key to retry.
- **5xx response not cached** → the client may retry the same key safely.

The asymmetric retry rule reflects underlying truth: 4xx means "your request was wrong, fix it and try with a new request"; 5xx means "we failed, please try the exact same thing again."

A periodic sweeper job removes idempotency rows older than 24 hours.

Inngest function steps must also be idempotent. Use `prisma.scan.upsert` instead of `prisma.scan.create` when a step might run twice. Treat external side effects (Stripe events, Graph mutations) with explicit deduplication keys.

## 9. Pagination

**Cursor-based only. No offset pagination, ever.**

```typescript
export const paginationInput = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
```

Implementation: fetch `limit + 1` rows, detect next page from the extra row, pop it off, use its `id` as `nextCursor`.

```typescript
const rows = await ctx.db.finding.findMany({
  where: { ... },
  orderBy: [{ severityRank: "desc" }, { firstSeenAt: "asc" }, { id: "asc" }],
  take: input.limit + 1,
  cursor: input.cursor ? { id: input.cursor } : undefined,
  skip: input.cursor ? 1 : 0,
});
const hasMore = rows.length > input.limit;
const items = hasMore ? rows.slice(0, -1) : rows;
const nextCursor = hasMore ? items[items.length - 1].id : null;
```

The `id: "asc"` tiebreaker in `ORDER BY` is mandatory. Without it, two rows with identical sort values could appear in different orders across pages and the cursor would skip or duplicate rows.

`totalCount` is *not* part of the standard response. Exact counts on filtered tables get slow fast and rarely earn their cost. If a UI genuinely needs an approximate total, add it per-procedure as an optional field, computed from query planner statistics rather than `SELECT COUNT(*)`.

## 10. Filtering and sorting

**Only allowlisted fields are exposed.** Never accept a raw Prisma `where` object from client input.

```typescript
filters: z.object({
  status: z.nativeEnum(FindingStatus).optional(),
  severity: z.nativeEnum(Severity).optional(),
  framework: z.string().optional(),
  scopeSlug: z.string().optional(),
  assignedTo: z.string().cuid().optional(),
  search: z.string().min(1).max(200).optional(),
}).optional(),
sort: z.object({
  field: z.enum(["severity", "firstSeenAt", "lastSeenAt", "status"]),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).optional(),
```

The router translates allowlisted filters into a safe Prisma `where`. The translation is explicit and audited; no dynamic field interpolation, no `eval`, no `$queryRaw` with user-controlled column names.

For free-text search, use Postgres full-text search (`@@`) rather than `LIKE '%...%'` — the latter doesn't use indexes and gets slow fast.

## 11. Rate limiting

Three tiers, all per-user-per-workspace except auth:

| Tier | Limit | Window | Scope |
|---|---|---|---|
| Queries | 100 req | 60s | per user per workspace |
| Mutations | 30 req | 60s | per user per workspace |
| Auth | 10 req | 60s | per IP |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers. Exceeding the limit returns `TOO_MANY_REQUESTS` with `WATCHTOWER:RATE_LIMIT:EXCEEDED`.

Vendor APIs are rate-limited *separately* per `(workspaceId, tenantId)`. Microsoft Graph has its own throttling rules; the connector adapter must respect them. Exceeding Graph's limits causes the scan to fail with `WATCHTOWER:VENDOR:RATE_LIMITED`.

## 12. Versioning

**Additive changes only.** No URL-based versioning inside the tRPC contract — the contract evolves additively.

Allowed: add a procedure, add an optional input field, add an output field.

Forbidden: remove a procedure, remove an output field, change a field type, make an optional field required, rename anything.

Deprecation process: mark the procedure `@deprecated` with a sunset date in JSDoc, log every call for 30 days, announce removal, then remove.

If a breaking change is genuinely unavoidable, create a new procedure (`finding.muteV2`) and deprecate the old one rather than mutating it in place.

The bigger external API surface — when Watchtower exposes a REST or OpenAPI layer for SIEM integrations — *will* use URL versioning (`/v1/findings`, `/v2/findings`), because external customers can't be expected to follow a Conventional-Commits-style deprecation cycle. The internal tRPC contract and the external REST contract have different rules.

## 13. The non-negotiables

Reading this whole document is good. Internalizing these eight rules is the minimum bar for writing a router that won't be rejected at code review:

1. **Every input and output has a Zod schema.** No `z.any()`, no `z.unknown()`.
2. **Every mutation has an `idempotencyKey: z.string().uuid()` in its input.**
3. **Every procedure starts with `ctx.requirePermission(...)`** — after the existence check, before any mutation.
4. **Database access is always through `ctx.db`.** Never `new PrismaClient()` inside a router.
5. **Errors are `TRPCError` with both Layer 1 and Layer 2 codes.** Never raw `Error` throws.
6. **Pagination is cursor-based.** Never offset, never `LIMIT OFFSET`.
7. **Filters and sort fields are allowlisted.** Never pass client input through to `where` directly.
8. **Tenant scoping is verified explicitly**, not relied on via foreign keys alone. RLS is the safety net, not the primary check.

A router that violates any of these is a security bug, not a style issue. Lint rules and code review will catch them; tests should also catch them; the architecture depends on them.

## 14. What's not in this document

A few things that conventionally live in an API conventions doc but live elsewhere in Watchtower:

- **Audit log discipline** (when to write events, hash chain, signing keys) → `Architecture.md` §7 and `Code-Conventions.md` (planned).
- **Soft-delete patterns and `onDelete: Restrict`** → `Code-Conventions.md`.
- **Secrets handling and `NEXT_PUBLIC_` rules** → `Code-Conventions.md`.
- **Frontend / RSC patterns** → `Code-Conventions.md`.
- **Testing tiers and factory patterns** → `Code-Conventions.md`.
- **The PR checklist** → `README.md` and `Code-Conventions.md`.
- **Vendor adapter patterns** (credentials decryption boundary, error wrapping) → `Code-Conventions.md`.
- **The full error code catalog** → `apps/web/src/server/errors.ts` once routers exist.
- **The full RBAC authorization matrix** → generated from the permissions catalog and router source, not maintained by hand.

The split is intentional. This document answers "how do I write a tRPC router." `Code-Conventions.md` will answer "how do I write any code in this repo." Different audiences, different reading moments, different update cadences.
