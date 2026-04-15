# ADR-003: Vendor Adapter Boundary

## Status

Accepted

## Date

2026-04-15

## Context

Watchtower collects compliance data from Microsoft 365 (and eventually other vendors) via their APIs. The existing `apps/worker/watchtower-v2.ts` makes direct Microsoft Graph SDK calls inline with the scan pipeline logic. This creates several problems:

1. **Credential leakage risk** — encrypted credentials must be decrypted somewhere, and without a clear boundary the decryption point spreads across multiple files.
2. **Vendor lock-in** — Graph SDK imports scattered across the codebase make it hard to add a second vendor connector (e.g., Google Workspace, AWS).
3. **Untestable** — mocking HTTP calls is fragile; mocking at the adapter interface is clean.
4. **No rate limiting isolation** — vendor rate limits (429s) need per-tenant tracking, not per-process tracking.
5. **Error semantics mismatch** — Graph API errors are vendor-specific; callers need Watchtower error codes.

## Decision

Introduce a `@watchtower/adapters` package that defines the **vendor adapter boundary**:

1. **All vendor SDK imports live exclusively in `packages/adapters/`** — no vendor SDK (e.g., `@microsoft/microsoft-graph-client`) is imported outside this package.
2. **Credentials are decrypted at the adapter boundary** — the adapter receives `encryptedCredentials: Buffer` and is responsible for decryption. No other code handles raw credentials.
3. **The adapter interface (`VendorAdapter<TDataSources>`) is the test seam** — integration tests mock the adapter, not HTTP calls.
4. **Rate limiting is per `(workspaceId, tenantId)` tuple** — enforced inside the adapter, invisible to callers.
5. **Retries for transient failures live inside the adapter** — callers never retry vendor calls directly.
6. **Vendor errors are translated to `AdapterError`** — a structured error with `kind` (transient, rate_limited, insufficient_scope, credentials_invalid, permanent) and a mapped `watchtowerError` definition.

### Adapter interface contract

```typescript
interface VendorAdapter<TDataSources extends Record<string, unknown>> {
  readonly name: string;
  collect<K extends keyof TDataSources & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<TDataSources[K]>>;
  listSources(): readonly (keyof TDataSources & string)[];
  requiredScopes<K extends keyof TDataSources & string>(source: K): readonly string[];
}
```

### Data flow

```
Scan Pipeline
  → creates AdapterConfig (workspaceId, tenantId, encryptedCredentials, traceId)
  → calls adapter.collect("conditionalAccessPolicies", config)
  → adapter decrypts credentials, builds Graph client, calls API
  → adapter catches vendor errors, wraps in AdapterError
  → adapter returns AdapterResult<ConditionalAccessPolicy[]>
  → scan pipeline stores evidence
```

## Consequences

### Positive

- **Single decryption point** — credentials are only decrypted inside the adapter. Security audits have one place to review.
- **Clean test seam** — the scan pipeline can be tested with a mock adapter that returns fixture data, no HTTP mocking needed.
- **Vendor-agnostic scan pipeline** — the pipeline works with any adapter that implements `VendorAdapter<TDataSources>`.
- **Rate limit isolation** — each tenant's rate limit state is tracked independently.
- **Structured error handling** — `AdapterError.kind` drives retry strategy, user notification, and evidence recording without vendor-specific logic in the caller.

### Negative

- **More indirection** — an adapter call adds one function call layer vs. direct SDK usage.
- **Type overhead** — each vendor needs its own `TDataSources` type map (e.g., `GraphDataSources`). This is intentional — it forces explicit definition of the data contract.
- **Migration work** — existing direct Graph SDK usage in `watchtower-v2.ts` must be refactored to go through the adapter. This is a Phase 2.1+ task.

### Neutral

- The adapter package does not implement the actual Graph adapter yet (that requires the Graph SDK dependency and credential decryption logic). Phase 2.1 establishes the types and interface; the implementation follows.
