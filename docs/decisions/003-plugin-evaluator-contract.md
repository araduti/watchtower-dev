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
- esbuild can tree-shake unused evaluators in the Core Engine
- Adding a new evaluator is adding a file, not modifying the engine
- Code review of evaluator changes is scoped to one file

### 4. CA policy specs remain typed data (not DB rows yet)

The CA policy match specifications (`CA_POLICY_SPECS`) were extracted to their own module but remain TypeScript data, not ControlAssertion rows. The principled move is to add an `operator: "ca-match"` with a `matchSpec: Json?` field to the ControlAssertion model, making CA checks data-driven. This is deferred to Phase 4.

### 5. This does NOT close the dual-engine open question

Architecture.md §12 asks "Is the dual-engine split worth the complexity?" That question is about compilation strategy (esbuild binary vs dynamic import), not evaluation architecture. This extraction makes the dual-engine split *cleaner* — built-in evaluator files can be pre-compiled via esbuild while customer files are dynamically loaded — but doesn't answer whether the cold-start performance difference justifies the split.

## Consequences

- Engine file reduced from ~1650 lines to ~1000 lines
- 27 evaluators are individually testable
- Same contract for built-in and future customer evaluators
- Registry pattern supports Phase 5 plugin loading
- CA policy specs still need data-driven migration (Phase 4)
