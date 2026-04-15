# ADR-003: Plugin evaluator contract and registry

**Status:** Accepted  
**Date:** 2026-04-14

## Context

The compliance engine (`argus.engine-v2.ts`) contained 27+ custom evaluator functions hardcoded in a monolithic `CUSTOM_EVALUATORS` map. This violated PRINCIPLES.md paragraph 1 — "our built-in checks and a customer's custom checks are the same kind of object" — because built-in checks with complex logic were inline code while customer checks would need to be Plugin Engine TypeScript files.

The dual-engine model (Architecture.md §3) envisions Core Engine built-ins pre-compiled via esbuild and Plugin Engine customer checks dynamically loaded. Both need to conform to the same contract.

## Decisions

### 1. Common evaluator contract (`EvaluatorFn`)

Every evaluator — built-in or customer-authored — conforms to:

```typescript
type EvaluatorFn = (snapshot: EvidenceSnapshot) => EvaluatorResult;

interface EvaluatorResult {
  pass: boolean;
  warnings: string[];
}
```

The engine doesn't know what an evaluator does. It calls `evaluate(snapshot)` and reads the result.

### 2. Evaluator registry with slug-based lookup

A central registry (`evaluators/registry.ts`) provides O(1) slug-based lookup. Built-in evaluators self-register on import. Alias support maps ScubaGear camelCase slugs to CIS kebab-case slugs.

This is the extension point for Phase 5 (customer plugins): the registry gains a `registerPlugin()` path that loads evaluators from PluginRepo-synced files, validates them via Zod, and runs them inside a sandbox. Same contract, different trust level.

### 3. Each evaluator is a separate module

Extracted from the monolithic map into `evaluators/builtin/{slug}.ts`. Each file exports an `EvaluatorModule` with `slug` and `evaluate`. Benefits:

- Individual evaluators can be tested in isolation
- ~~esbuild can tree-shake unused evaluators in the Core Engine~~ (no longer applicable — single engine, see [ADR-004](./004-single-engine-firecracker-sandbox.md))
- Adding a new evaluator is adding a file, not modifying the engine
- Code review of evaluator changes is scoped to one file

### 4. CA policy specs are now assertion data (Phase 4 complete)

The CA policy match specifications were originally extracted to `evaluators/ca-policy-specs.ts` as typed data in Phase 2. In Phase 4, they were migrated to inline match specs in `ControlAssertion.expectedValue`, using the new `operator: "ca-match"`. This makes CA checks fully data-driven — the same as every other assertion.

The `ca-match` operator routes evaluation through the existing CA policy match engine, reconstructing a `PolicySpec` from the assertion's metadata and `expectedValue`. No separate spec file is needed; the match spec travels with the assertion as serializable JSON data.

The deprecated `evaluators/ca-policy-specs.ts` module and the `ca-policy-match:` evaluatorSlug routing pattern have been removed.

### 5. The dual-engine question is now closed

Architecture.md §12 asked "Is the dual-engine split worth the complexity?" [ADR-004](./004-single-engine-firecracker-sandbox.md) closes this: **No.** The dual-engine split has been collapsed into a single Bun-based engine. All evaluators — built-in and customer-authored — load through the same registry. Built-in evaluators run in-process as trusted code. Customer-authored evaluators execute inside Firecracker microVMs for hardware-level isolation.

The evaluator extraction in this ADR made the collapse trivial: both paths already conformed to the `EvaluatorFn` contract. Removing the distinction eliminated a build pipeline, a deployment artifact, and a categorization decision without changing the evaluation architecture.

## Consequences

- Engine file reduced from ~1650 lines to ~1000 lines
- 27 evaluators are individually testable
- Same contract for built-in and future customer evaluators
- Registry pattern supports Phase 5 plugin loading
- CA policy specs are fully data-driven via `operator: "ca-match"` (Phase 4 complete)
