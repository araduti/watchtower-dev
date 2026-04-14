# Plugin Evaluator Extraction — Remaining Phases

This document tracks the remaining work after Phase 1 and Phase 2, which are complete. It also includes evaluation notes from the principles review.

## Completed

### Phase 1 — Define contract & extract evaluators ✅

- Created `EvaluatorFn` contract (`evaluators/types.ts`)
- Extracted 27 evaluators into `evaluators/builtin/*.ts`
- Barrel export in `evaluators/builtin/index.ts`

### Phase 2 — Registry & engine wiring ✅

- Created evaluator registry (`evaluators/registry.ts`) with O(1) slug lookup
- Extracted `CA_POLICY_SPECS` into `evaluators/ca-policy-specs.ts`
- Wired `argus.engine-v2.ts` to use registry instead of inline map
- Registered ScubaGear camelCase aliases
- ADR-003 written

---

## Remaining Phases

### Phase 3 — Testing

Individual evaluators can now be tested in isolation. This phase adds:

- [ ] Unit tests for each extracted evaluator module
- [ ] Registry tests: registration, alias resolution, duplicate detection
- [ ] Integration test: run the full engine against `evidence.json` and verify results match the pre-extraction baseline (regression test)
- [ ] Test factory helpers for building mock `EvidenceSnapshot` objects

**Priority:** High — the extraction is a refactor that must be proven behavior-preserving.

### Phase 4 — CA policy specs as assertion data

The CA policy match specs (`CA_POLICY_SPECS`) are currently typed data in code. Per PRINCIPLES.md paragraph 1, they should be data rows like any other assertion.

- [ ] Add `operator: "ca-match"` to the `Operator` enum
- [ ] Add `matchSpec: Json?` field to `ControlAssertion` (or use `expectedValue` with a structured shape)
- [ ] Migrate the 12 CA policy specs into `MOCKED_CONTROL_ASSERTIONS` (or the ControlAssertion table when DB is live)
- [ ] Update `evaluateControl()` to handle `ca-match` operator by running the match spec through the CA match engine
- [ ] Remove `evaluators/ca-policy-specs.ts` once all specs are data

**Rationale from evaluation:** _"The principled move is to bring the CA match specs into the same ControlAssertion model. The `operator: 'custom'` already exists; the `evaluatorSlug: 'ca-policy-match:5.2.2.1'` pattern already routes them. Making it a 'plugin' keeps it as code, just in a different file."_

### Phase 5 — Customer plugin loading & sandboxing

This is the most security-critical phase. It extends the registry to load customer-authored evaluators from PluginRepo-synced GitHub files.

- [ ] Define plugin file format and Zod validation schema
- [ ] Implement `registerPlugin()` in the registry — loads, validates, and registers customer evaluators
- [ ] Choose sandboxing strategy (Architecture.md §12 open question):
  - Option A: `isolated-vm` (V8 isolate, lowest overhead)
  - Option B: Separate Bun process with seccomp
  - Option C: Firecracker microVMs (highest isolation, most complexity)
- [ ] Implement sandbox execution boundary
- [ ] Plugin evaluators must not access:
  - Network
  - File system outside their sandbox
  - Other tenants' evidence
  - The database directly
- [ ] Plugin error handling: timeout, crash, invalid output → `EvaluatorResult` with failure
- [ ] Integrate with `PluginRepo` sync pipeline (Inngest worker)

**PRINCIPLES.md constraint:** _"Customer-authored checks run inside a sandboxed execution boundary, because code the platform has never seen is code the platform must not trust."_

---

## Evaluation Notes (Principles & Roadmap Review)

These notes are from the principles/roadmap evaluation of the extraction plan.

### Alignment with PRINCIPLES.md

| Principle | Status |
|---|---|
| Checks are data, not code (¶1) | ✅ Restored — evaluators were inline code, now they're loadable modules |
| Built-in and customer checks are the same object (¶1) | ✅ Common `EvaluatorFn` contract |
| Sandboxed execution for untrusted code (¶2) | ✅ Phase 5 — contract supports it |
| Vendor adapters own credentials, not evaluation (Code-Conventions §6) | ✅ Evaluation removed from connectors |
| Findings are durable, scans are ephemeral (¶3) | ➖ Neutral |
| Three-layer isolation (Architecture §5) | ➖ Neutral |
| Tamper-evident audit log (¶4) | ➖ Neutral |

### Corrections applied

1. **Dual-engine question (Architecture.md §12):** This extraction does NOT close the dual-engine open question. That question is about compilation strategy (esbuild vs dynamic import), not evaluation architecture. The extraction makes the split *cleaner* but doesn't answer whether the cold-start performance difference justifies maintaining two paths. See ADR-003.

2. **CA Policy Specs should be data, not a plugin:** Deferred to Phase 4. The CA match specs are still typed data in code. The principled target is ControlAssertion rows with `operator: "ca-match"` and a `matchSpec` JSON field, making CA checks data-driven like simple assertions.

### Roadmap timing

The README shows the project at **Phase 1.2** (idempotency middleware, audit log hash chain, rate limiting). The engine extraction is logically Phase 2+ work. The right time for full production integration is when the engine is integrated into the Inngest worker pipeline — when evidence collection feeds into real Findings via real Scans. Phase 1.2's infrastructure is foundational to the execution path the engine will use.

The extraction itself (Phase 1–2 done here) is safe to do now because it's a purely structural refactor of the prototype engine, not a change to the production application path.
