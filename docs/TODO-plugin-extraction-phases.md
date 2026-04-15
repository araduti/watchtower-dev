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

### Phase 3 — Testing ✅

Individual evaluators can now be tested in isolation. This phase adds:

- [x] Unit tests for each extracted evaluator module (tests/phase2/evaluators/)
  - DNS evaluators: 55 tests (dmarc-published, dmarc-reject, dmarc-cisa-contact, spf-records-published)
  - CIS/Entra ID evaluators: 103 tests (idle-session-timeout, pra-requires-approval, privileged-role-access-reviews, guest-access-reviews, pim-used-for-privileged-roles, onprem-password-protection, custom-banned-passwords, b2b-allowed-domains-only, dynamic-guest-group, personal-device-enrollment)
  - Teams evaluators: 59 tests (teams-security-reporting, teams-unmanaged-inbound, teams-unmanaged-access, teams-external-access)
  - Exchange/ScubaGear evaluators: 108 tests (no-domain-whitelisting, no-external-forwarding, calendar-sharing, user-consent, preset-policies, 10 stubs)
- [x] Registry tests: registration, alias resolution, duplicate detection (tests/phase2/evaluator-registry.test.ts — 56 tests)
- [x] Integration test: run the full engine against `evidence.json` and verify results match the pre-extraction baseline (tests/phase2/engine-regression.test.ts — 44 tests)
- [x] Test factory helpers for building mock `EvidenceSnapshot` objects (tests/factories/evidence.ts)

**Result:** 425 new tests, all passing. Extraction proven behavior-preserving.

### Phase 4 — CA policy specs as assertion data ✅

The CA policy match specs (`CA_POLICY_SPECS`) were typed data in code. Per PRINCIPLES.md paragraph 1, they are now data rows like any other assertion.

- [x] Add `operator: "ca-match"` to the `Operator` type
- [x] Inline match specs into `ControlAssertion.expectedValue` (structured JSON, no new model field needed)
- [x] Migrate all 13 CA policy assertions in `MOCKED_CONTROL_ASSERTIONS` to use `operator: "ca-match"` with match specs in `expectedValue`
- [x] Update `evaluateControl()` to handle `ca-match` operator by reconstructing a `PolicySpec` from the assertion data and running it through the CA match engine
- [x] Remove the `ca-policy-match:` evaluatorSlug routing pattern from `evaluateControl()`
- [x] Remove `evaluators/ca-policy-specs.ts` — all specs are now data
- [x] Inline `ADMIN_ROLES` constant in `assertions.ts` (will be inlined in DB JSON when ControlAssertion table is live)
- [x] Update Prisma schema comment to include `"ca-match"` in operator list
- [x] Update ADR-003 to reflect Phase 4 completion
- [x] Tests: 82 new tests for ca-match operator (spec structure, migration completeness, admin role inlining)
- [x] Regression: all 510 tests pass (428 existing + 82 new)

**Design decision:** Match specs are stored in `expectedValue` (already `Json?` in Prisma) rather than adding a new `matchSpec` field. This is cleaner because:
- `expectedValue` is the natural home for "what the operator compares against"
- No schema migration needed
- CA match specs are just another form of expected value, like `{min: 2, max: 4}` for the `count` operator

**Rationale applied:** _"The principled move is to bring the CA match specs into the same ControlAssertion model. The `operator: 'ca-match'` handles them as data. Adding a framework or modifying a CA check is now a database operation, not a code change."_

### Phase 5 — Customer plugin loading & sandboxing

This is the most security-critical phase. It extends the registry to load customer-authored evaluators from PluginRepo-synced GitHub files.

**Sandboxing decision: Firecracker microVMs** (see [ADR-004](../decisions/004-single-engine-firecracker-sandbox.md))

The dual-engine model has been collapsed into a single engine. Customer plugins execute inside Firecracker microVMs — hardware-virtualized guest kernels with no network, no host filesystem access, and no database connection. This is the strongest sandboxing option available, consistent with PRINCIPLES.md ¶2.

- [ ] Define plugin file format and Zod validation schema
- [ ] Implement `registerPlugin()` in the registry — loads, validates, and registers customer evaluators with `sandboxed: true`
- [x] Choose sandboxing strategy (Architecture.md §12 open question): **Firecracker microVMs** (ADR-004)
- [ ] Implement `@watchtower/sandbox` package — Firecracker VM lifecycle manager
- [ ] Build rootfs image (minimal Alpine + Bun, ~50MB)
- [ ] Plugin evaluators must not access:
  - Network (no virtio-net device)
  - File system outside the read-only rootfs
  - Other tenants' evidence
  - The database directly
- [ ] Plugin error handling: timeout, crash, invalid output → `EvaluatorResult` with failure
- [ ] Dev-mode fallback for macOS contributors (no KVM)
- [ ] Integrate with `PluginRepo` sync pipeline (Inngest worker)

**PRINCIPLES.md constraint:** _"Customer-authored checks run inside a sandboxed execution boundary, because code the platform has never seen is code the platform must not trust."_

---

## Evaluation Notes (Principles & Roadmap Review)

These notes are from the principles/roadmap evaluation of the extraction plan.

### Alignment with PRINCIPLES.md

| Principle | Status |
|---|---|
| Checks are data, not code (¶1) | ✅ Restored — evaluators are loadable modules, CA specs are assertion data |
| Built-in and customer checks are the same object (¶1) | ✅ Common `EvaluatorFn` contract + data-driven CA specs |
| Sandboxed execution for untrusted code (¶2) | ✅ Phase 5 — contract supports it |
| Vendor adapters own credentials, not evaluation (Code-Conventions §6) | ✅ Evaluation removed from connectors |
| Findings are durable, scans are ephemeral (¶3) | ➖ Neutral |
| Three-layer isolation (Architecture §5) | ➖ Neutral |
| Tamper-evident audit log (¶4) | ➖ Neutral |

### Corrections applied

1. **Dual-engine question (Architecture.md §12): CLOSED.** The dual-engine split has been collapsed into a single Bun-based engine. Customer plugin sandboxing uses Firecracker microVMs. See [ADR-004](../decisions/004-single-engine-firecracker-sandbox.md).

2. **CA Policy Specs are now data (Phase 4 complete):** The CA match specs have been migrated from typed code (`evaluators/ca-policy-specs.ts`) into `ControlAssertion.expectedValue` with `operator: "ca-match"`. CA checks are now data-driven like simple assertions. The `evaluators/ca-policy-specs.ts` module has been removed.

### Roadmap timing

The README shows the project at **Phase 1.2** (idempotency middleware, audit log hash chain, rate limiting). The engine extraction is logically Phase 2+ work. The right time for full production integration is when the engine is integrated into the Inngest worker pipeline — when evidence collection feeds into real Findings via real Scans. Phase 1.2's infrastructure is foundational to the execution path the engine will use.

The extraction itself (Phase 1–2 done here) is safe to do now because it's a purely structural refactor of the prototype engine, not a change to the production application path.
