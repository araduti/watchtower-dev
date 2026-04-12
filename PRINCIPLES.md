Watchtower Core Principles
This document outlines the architectural and philosophical pillars of Watchtower. Every engineering decision—from database schema design to the sandboxing of execution—must align with these principles.

1. Compliance as Structured Knowledge
Compliance is not a "feature" or a set of static reports; it is a live data state.

The Inversion: We do not write "scanners" that output PDF reports. We treat frameworks (CIS, NIST), controls, and mappings as rows in a relational database.

Version Control: A new CIS version is a database migration. A customer’s internal policy is a Pull Request against their own Git repository.

Unified Objects: Built-in checks and customer-authored checks are the same object types, stored in the same tables, and executed via the same engine. Overriding a default check is the same operation as writing a novel one.

Technical Enforcement: Global Check and Framework tables reference customer-specific PluginRepo rows.

2. Zero-Trust Execution Boundary
Code the platform has never seen is code the platform must not trust.

Sandboxing: Customer-authored checks run inside a strictly bounded execution environment (V8 Isolates).

Isolation: Policies are denied access to the network, the local filesystem, and the underlying database. They receive a read-only Resource Graph and return a structured Observation.

Input Posture: This "untrusted" posture is applied consistently to every input not authored by the core Watchtower team.

Technical Enforcement: Bun-based worker nodes spawning isolated V8 contexts with memory and CPU caps.

3. Observation-Finding Inversion
The fundamental question is not "What did the latest scan find?" but "What is the current state of this condition, and how did it get here?"

Observations: The raw, ephemeral output of a scan (Pass/Fail/Error).

Findings: Durable, stateful entities that persist across scans. A finding has a lifecycle: OPEN → ACKNOWLEDGED → RESOLVED.

Drift Detection: Because we diff Observations against Findings in the database, drift detection and historical reasoning ("How long has this been broken?") are first-class citizens of the data model.

Technical Enforcement: PostgreSQL stored procedures performing Set Difference operations between Observation snapshots and Finding states.

4. Provable History (Non-Repudiation)
We do not "log everything"; we provide provable history.

Immutable Ledger: Every state change (muting a finding, resolving a vulnerability) is recorded in an audit trail that is append-only at the database level.

Cryptographic Verification: Entries are hash-chained and signed with Ed25519 keys. A security-accountable customer can prove to an auditor that no finding was silently edited or deleted.

Independent Verification: The audit trail is designed so that a third party can verify the integrity of the compliance history without needing access to the application source code.

Technical Enforcement: AuditEvent table with prevHash and signature columns, protected by PostgreSQL BEFORE UPDATE OR DELETE triggers.

5. Multi-Tenant Hard isolation
Security at the application layer is insufficient; security must be enforced at the data layer.

RLS-First: No query reaches the database without a workspace_id context.

Role Separation: The engine that runs migrations (watchtower_migrate) and the engine that serves the UI (watchtower_app) are separate database roles with distinct permission sets.

Scope Boundaries: Support for both SOFT (MSP-style) and STRICT (Enterprise-style) isolation modes at the schema level.

Technical Enforcement: PostgreSQL Row Level Security (RLS) policies and SET app.current_workspace_id session variables.
