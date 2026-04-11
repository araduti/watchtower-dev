# Watchtower — System Architecture

Watchtower is a Compliance-as-a-Service engine for Microsoft 365. It runs automated CIS/NIST audits with GitOps-driven custom logic, designed for on-premise execution on a NUC cluster with a multi-tenant cloud experience.

## 1. The Dual-Engine Model

> ⚠️ **Open design question:** the split below is the current plan, but we have not yet measured whether the cold-start win justifies maintaining two execution paths. See `docs/decisions/` (TBD) for the open ADR.

To balance speed and flexibility, the execution engine is split:

- **The Core Engine (default policies):** pre-compiled into a high-speed binary using `esbuild` and executed natively via Bun. Contains immutable CIS/NIST foundations. Targets <50ms cold start and is aggressively tree-shaken.
- **The Plugin Engine (custom policies):** dynamically loads TypeScript files synced from customer GitHub repositories. Validated at runtime via Zod to prevent crashes and enforce type safety. Treated as an untrusted execution surface — see the Plugin Engine threat model (TBD).

## 2. Data Flow: Tenant Scan Lifecycle

1. **Trigger.** A user initiates a scan from the Next.js UI, or a scheduled cron fires the event.
2. **Dispatch.** The tRPC router emits an `audit/trigger` event to **Inngest**.
3. **Stateful execution.**
   - Inngest retrieves tenant credentials from **PostgreSQL**.
   - Invokes the **Bun worker** (Core Engine + GitOps sync for the Plugin Engine).
   - The worker queries **Microsoft Graph** via parallelized batch requests (HTTP/2 multiplexing).
   - Policies are evaluated against the fetched data in-memory.
4. **Storage.**
   - JSON results are written to **PostgreSQL** via Prisma.
   - Manual evidence (uploaded PDFs, screenshots) is streamed to **Garage S3**.
5. **Billing.** Inngest reports completed scan counts to **Stripe** for metered billing, keyed off the Better Auth Organization ID.

## 3. Infrastructure (On-Premise NUC Cluster)

> ⚠️ **Open design question:** the deployment target (Watchtower-hosted NUC cluster vs. customer-deployed vs. hybrid) is still under discussion. The shape below assumes the self-hosted NUC model.

The platform is designed to scale horizontally across commodity hardware.

- **Traefik** handles external ingress, SSL termination, and routing.
- **Docker Swarm** manages the container lifecycle across NUCs. *(k3s is under consideration as an alternative.)*
- **Network isolation:** workers and the database live on an internal Docker network. Only the Next.js API is exposed publicly.
- **Garage S3** replicates uploaded evidence across the cluster to survive single-disk failure.

Redis is intentionally **not** in the stack. Inngest handles queueing and durable state, Postgres handles sessions and application data, and no current workload justifies a separate cache or pub/sub layer. If a concrete need emerges later (e.g., a live dashboard with high-fanout subscriptions), it can be added back with a documented role. Garage was chosen specifically because it targets geo-distributed, small-cluster, commodity-hardware deployments — the NUC scenario. Disaster-recovery and restore-test procedures are still TBD.

## 4. Trust Boundaries

- **Public internet → Next.js API.** Authenticated via Better Auth sessions, scoped to an Organization.
- **Next.js → Inngest → Bun worker.** Internal network only.
- **Bun worker → Microsoft Graph.** Outbound HTTPS using per-tenant encrypted credentials.
- **GitHub (customer policy repos) → Plugin Engine.** Untrusted code path. All inputs Zod-validated; sandboxing strategy TBD.
- **Bun worker → Garage S3.** Internal network; pre-signed URLs issued for direct browser uploads.

## 5. Components Not Yet on the Diagram

These exist in the system but should be added to the architecture diagram before the next review:

- **Secrets management** for MS Graph credentials (storage-at-rest and unseal-at-startup).
- **GitHub App** for syncing customer policy repositories into the Plugin Engine.
- **Observability stack** (logs, metrics, traces) — critical for on-prem debugging.
