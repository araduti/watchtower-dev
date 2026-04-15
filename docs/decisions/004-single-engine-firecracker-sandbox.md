# ADR-004: Single-engine collapse and Firecracker microVM sandboxing

**Status:** Accepted  
**Date:** 2026-04-15

## Context

Architecture.md §12 tracked two related open questions:

1. **"Is the dual-engine split worth the complexity?"** — The system was designed with a Core Engine (esbuild-compiled binary, <50ms cold start) for built-in CIS/NIST checks and a Plugin Engine (dynamic TypeScript loader) for customer-authored checks. ADR-003 §5 noted that the evaluator extraction made the split cleaner but didn't answer whether it was worth maintaining.

2. **"What sandboxing strategy for customer plugins?"** — Three options were under consideration: `isolated-vm` (V8 isolate), Bun process with seccomp, and Firecracker microVMs.

Both questions are now resolved by this ADR.

## Decision 1: Collapse the dual-engine into a single engine

The Core Engine and Plugin Engine merge into one execution path. There is no longer a distinction between how built-in checks and customer checks are loaded or executed.

**Single engine model:**

- One Bun-based engine process loads all evaluators through the existing registry (`evaluators/registry.ts`)
- Built-in evaluators load on import — 27 modules in `evaluators/builtin/`, registered at startup via the barrel export
- Customer evaluators are loaded from PluginRepo-synced files, Zod-validated, and registered via `registerPlugin()` on the same registry
- No esbuild compilation step. No tree-shaking. No separate binary
- The `EvaluatorFn` contract is unchanged

**Why:**

- The <50ms cold-start optimization was never measured against production workloads. For 27 small pure-function evaluators on Bun, dynamic import time is single-digit milliseconds — not worth maintaining a second execution path.
- The registry is already the single dispatch point. The "dual engine" was two conceptual load paths behind one registry. Removing the distinction eliminates a build pipeline, a deployment artifact, and a categorization decision (which checks go where).
- ADR-003's evaluator extraction made both paths conform to the same `EvaluatorFn` contract, making the collapse trivial.

**What this costs:**

- No tree-shaking of unused evaluators (all 27 load). Negligible — these are small pure functions.
- Cold start for built-in checks is dynamic import time rather than pre-compiled binary time. Unmeasurable in practice.

## Decision 2: Firecracker microVMs for customer plugin sandboxing

Customer-authored evaluators execute inside Firecracker microVMs — hardware-virtualized guest kernels with no network, no host filesystem access, and no database connection.

**Why Firecracker over the alternatives:**

| Option | Isolation level | Escape surface | Assessment |
|---|---|---|---|
| `isolated-vm` (V8 isolate) | Same process | V8 bugs = host compromise | A V8 zero-day gives the attacker the host process, which holds database connections, credentials, and the audit signing key. Unacceptable. |
| Bun + seccomp | OS process with syscall filter | Kernel bugs in allowed syscalls | Better than V8 isolates, but seccomp profiles are fragile. One missing filter and the plugin can escape. Bun's syscall surface is not small. |
| Firecracker microVM | Hardware-virtualized guest kernel | KVM hypervisor bugs only | Strongest boundary. The attack surface is KVM + the Firecracker VMM — hardened by AWS for Lambda/Fargate at massive scale. |

Watchtower holds every tenant's compliance findings, audit trails, and encrypted M365 credentials. PRINCIPLES.md ¶2: *"code the platform has never seen is code the platform must not trust."* The most secure sandboxing option is the only one consistent with the platform's security posture.

**How it works:**

```
Inngest worker (Bun)
  │
  ├── Built-in evaluators: run in-process (trusted code, same registry)
  │
  └── Customer plugin evaluators: dispatched to Firecracker microVM
        │
        ├── Firecracker VMM spawns a minimal Linux guest (~125ms boot)
        ├── Guest runs a thin Bun runtime with ONLY:
        │     - The plugin's TypeScript file (Zod-validated)
        │     - The EvidenceSnapshot for this tenant (serialized JSON)
        │     - A stdout protocol for returning EvaluatorResult
        ├── Guest has NO:
        │     - Network access (no virtio-net device attached)
        │     - Filesystem beyond the read-only rootfs + plugin overlay
        │     - Database connection
        │     - Access to other tenants' data
        │     - Access to the host filesystem, signing keys, or credentials
        ├── Timeout: hard-killed after N seconds (configurable per workspace)
        └── Result: JSON on stdout → parsed → validated against EvaluatorResult schema
```

**Key design decisions:**

1. **Rootfs image:** Minimal Alpine-based ext4 image with Bun pre-installed (~50MB). Built once, versioned, stored as an immutable artifact. Never modified by plugins.

2. **Plugin injection:** The customer's `.ts` file is mounted as a read-only overlay. The guest does `import(pluginPath)` → calls `evaluate(snapshot)` → writes JSON to stdout → exits.

3. **Evidence passing:** The `EvidenceSnapshot` is serialized to JSON and passed via vsock channel or stdin. Only the evidence for the current tenant's current scan is visible. Cross-tenant data leakage is impossible — the VM literally doesn't have it.

4. **Result protocol:** The guest writes `{"pass": boolean, "warnings": string[]}` to stdout. The host validates against the `EvaluatorResult` Zod schema and kills the VM. Non-conforming output = evaluator failure result.

5. **Failure modes:**
   - Timeout → kill VM, return `{ pass: false, warnings: ["Plugin execution timed out"] }`
   - Crash → return `{ pass: false, warnings: ["Plugin crashed: <sanitized stderr>"] }`
   - Invalid output → return `{ pass: false, warnings: ["Plugin returned invalid output"] }`
   - Boot failure → return `{ pass: false, warnings: ["Sandbox initialization failed"] }`, alert ops

6. **Performance:** Firecracker boots in ~125ms. For a scan running 27 built-in checks (in-process, microseconds each) plus 1–5 customer plugins (each in a microVM), the total plugin overhead is ~125–625ms. Against a scan spending 5–30 seconds collecting data from Graph API, this is noise.

7. **Concurrency:** Multiple microVMs run in parallel (one per plugin per tenant). Firecracker is designed for thousands of concurrent VMs on a single host.

8. **Dev-mode fallback:** Firecracker requires KVM (Linux bare metal). For contributors on macOS, plugins run in a dev-mode fallback (same-process, no sandbox, with a loud warning). Sandbox isolation cannot be tested on macOS.

**Infrastructure:**

- `@watchtower/sandbox` package — Firecracker VM lifecycle manager
- `docker/firecracker/` — rootfs image build script, kernel image reference
- `/dev/kvm` device mount in `docker-compose.prod.yml` for the worker service
- Firecracker is a process spawned by the worker, not a long-running service

**Integration with the evaluator registry:**

- `registerPlugin()` stores the plugin source and marks it as `sandboxed: true`
- `getEvaluator(slug)` for a sandboxed evaluator returns a wrapper function that serializes evidence, calls `spawnPluginVM()`, and returns the validated `EvaluatorResult`
- The engine doesn't know or care that the evaluator ran in a VM — it's still just an `EvaluatorFn`

## Consequences

- The dual-engine open question (Architecture.md §12) is closed: **No**, the split was not worth the complexity.
- The sandboxing strategy open question is closed: **Firecracker microVMs**, the strongest isolation available.
- One build pipeline, one deployment artifact, one execution model for the worker.
- Customer plugin security story: "your code runs in its own virtual machine with no network, no filesystem, and no access to other tenants' data."
- KVM requirement for production (native on the NUC; unavailable on macOS dev machines).
- ~125ms per plugin execution overhead (acceptable against 5–30s scan collection time).
- Alignment with PRINCIPLES.md ¶2 (untrusted code posture) and ¶6 (self-hosted infrastructure).
