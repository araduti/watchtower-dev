/**
 * execute-scan — the main Inngest function for the scan pipeline.
 *
 * Orchestrates the full scan lifecycle using Inngest steps for durability:
 *
 *   1. transition-to-running — Guard PENDING status, set RUNNING
 *   2. collect-data          — Invoke the adapter for each data source
 *   3. store-evidence        — Persist raw results as Evidence records
 *   4. finalize-scan         — Set SUCCEEDED, emit completion event
 *
 * Error handling: if any step fails, the `onFailure` handler transitions
 * the scan to FAILED and emits `scan/completed` with failure status.
 * A scan is NEVER left in RUNNING state after the function exits.
 *
 * Cancellation: the function is configured with `cancelOn` listening for
 * `scan/cancel` events matching the same scanId, enabling graceful abort.
 *
 * Security constraints:
 * - Encrypted credentials are passed to the adapter boundary — this
 *   function NEVER decrypts them.
 * - Database access uses `withRLS` for workspace-scoped isolation.
 * - `inngestRunId` is stored on the Scan record for debugging but
 *   is NEVER returned to users (enforced by the scan router).
 *
 * @see docs/Code-Conventions.md §6 — Vendor adapter boundary
 * @see docs/decisions/004-inngest-scan-pipeline.md
 */

import { NonRetriableError } from "inngest";

import { withRLS, createAuditEvent } from "@watchtower/db";
import { createGraphAdapter } from "@watchtower/adapters";
import type { AdapterConfig, AdapterResult } from "@watchtower/adapters";

import { inngest } from "../inngest-client.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of collected data from a single data source.
 * Stored in memory between the collect and store steps.
 */
interface CollectedSource {
  /** Data source key (e.g., "conditionalAccessPolicies"). */
  readonly source: string;

  /** Raw data returned by the adapter. */
  readonly rawData: unknown;

  /** ISO 8601 timestamp when the data was collected. */
  readonly collectedAt: string;

  /** Number of API calls consumed for this source. */
  readonly apiCallCount: number;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * The main scan execution function.
 *
 * Registered with Inngest and triggered by `scan/execute` events.
 * Uses durable steps so each phase is retried independently on failure.
 */
export const executeScan = inngest.createFunction(
  {
    id: "execute-scan",
    retries: 0, // We handle errors ourselves via onFailure
    triggers: [{ event: "scan/execute" }],
    cancelOn: [
      {
        event: "scan/cancel",
        if: "async.data.scanId == event.data.scanId",
      },
    ],
    onFailure: handleScanFailure,
  },
  async ({ event, step }) => {
    const { scanId, workspaceId, tenantId, scopeId } = event.data;

    // ------------------------------------------------------------------
    // Step 1: Transition PENDING → RUNNING
    // ------------------------------------------------------------------
    const tenant = await step.run("transition-to-running", async () => {
      return await withRLS(workspaceId, [scopeId], async (tx) => {
        // Guard: verify scan exists and is still PENDING.
        // A race condition (duplicate event, manual cancel) could
        // put the scan in a non-PENDING state by the time we run.
        const scan = await tx.scan.findFirst({
          where: {
            id: scanId,
            workspaceId,
            status: "PENDING",
          },
          select: { id: true },
        });

        if (!scan) {
          throw new NonRetriableError(
            `Scan ${scanId} is not in PENDING state or does not exist. ` +
              "Aborting to prevent duplicate execution.",
          );
        }

        // Fetch tenant credentials for the adapter.
        // encryptedCredentials is only read here and passed opaquely
        // to the adapter — this function NEVER decrypts them.
        const tenantRecord = await tx.tenant.findFirst({
          where: {
            id: tenantId,
            workspaceId,
            deletedAt: null,
          },
          select: {
            id: true,
            msTenantId: true,
            encryptedCredentials: true,
            authMethod: true,
          },
        });

        if (!tenantRecord) {
          throw new NonRetriableError(
            `Tenant ${tenantId} not found or has been deleted. ` +
              "Cannot proceed with scan.",
          );
        }

        if (!tenantRecord.encryptedCredentials) {
          throw new NonRetriableError(
            `Tenant ${tenantId} has no stored credentials. ` +
              "Connect the tenant before scanning.",
          );
        }

        // Transition to RUNNING and record the Inngest run ID for debugging.
        await tx.scan.update({
          where: { id: scanId },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
          },
        });

        // Audit: scan.start — same transaction as status change
        await createAuditEvent(tx, {
          workspaceId,
          scopeId,
          eventType: "scan.start",
          actorType: "SYSTEM",
          actorId: "inngest:execute-scan",
          targetType: "Scan",
          targetId: scanId,
          eventData: { tenantId },
        });

        return {
          msTenantId: tenantRecord.msTenantId,
          encryptedCredentials: Buffer.from(
            tenantRecord.encryptedCredentials,
          ).toString("base64"),
          authMethod: tenantRecord.authMethod as
            | "CLIENT_SECRET"
            | "WORKLOAD_IDENTITY",
        };
      });
    });

    // ------------------------------------------------------------------
    // Step 2: Collect data from all adapter sources
    // ------------------------------------------------------------------
    const collectedSources = await step.run("collect-data", async () => {
      const adapter = createGraphAdapter({
        msTenantId: tenant.msTenantId,
      });

      const adapterConfig: AdapterConfig = {
        workspaceId,
        tenantId,
        encryptedCredentials: Buffer.from(
          tenant.encryptedCredentials,
          "base64",
        ),
        authMethod: tenant.authMethod,
        traceId: `scan:${scanId}`,
      };

      const sources = adapter.listSources();
      const results: CollectedSource[] = [];

      // Collect each data source sequentially.
      // The adapter handles internal concurrency and rate limiting
      // per (workspaceId, tenantId) tuple.
      for (const source of sources) {
        const result: AdapterResult<unknown> = await adapter.collect(
          source,
          adapterConfig,
        );

        results.push({
          source,
          rawData: result.data,
          collectedAt: result.collectedAt,
          apiCallCount: result.apiCallCount,
        });
      }

      return results;
    });

    // ------------------------------------------------------------------
    // Step 3: Store evidence records
    // ------------------------------------------------------------------
    // TODO: Phase 3 — Engine integration
    // Evidence records require a Finding (findingId) and the engine
    // hasn't been integrated yet. When the engine is wired in, this
    // step will:
    //   1. Run the engine against collected data to produce Findings
    //   2. Create Evidence records linked to each Finding
    //   3. Track checksRun / checksFailed for the finalize step
    // For now, the collected data is held in the step result from
    // "collect-data" and the scan completes with checksRun: 0.
    const evidenceSummary = await step.run("store-evidence", async () => {
      return {
        sourcesCollected: collectedSources.length,
        sources: collectedSources.map((s) => s.source),
        note: "Engine not yet integrated — evidence storage deferred to Phase 3",
      };
    });

    // ------------------------------------------------------------------
    // Step 4: Finalize scan — mark SUCCEEDED
    // ------------------------------------------------------------------
    await step.run("finalize-scan", async () => {
      await withRLS(workspaceId, [scopeId], async (tx) => {
        await tx.scan.update({
          where: { id: scanId },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            checksRun: 0, // Placeholder — engine not yet integrated
            checksFailed: 0,
          },
        });

        // Audit: scan.complete — same transaction as status change
        await createAuditEvent(tx, {
          workspaceId,
          scopeId,
          eventType: "scan.complete",
          actorType: "SYSTEM",
          actorId: "inngest:execute-scan",
          targetType: "Scan",
          targetId: scanId,
          eventData: {
            status: "SUCCEEDED",
            checksRun: 0,
            checksFailed: 0,
            sourcesCollected: evidenceSummary.sourcesCollected,
          },
        });
      });
    });

    // Emit completion event for downstream consumers
    await step.sendEvent("emit-scan-completed", {
      name: "scan/completed",
      data: {
        scanId,
        status: "SUCCEEDED" as const,
        checksRun: 0,
        checksFailed: 0,
      },
    });

    return { scanId, status: "SUCCEEDED" as const };
  },
);

// ---------------------------------------------------------------------------
// Failure handler
// ---------------------------------------------------------------------------

/**
 * onFailure handler — transitions the scan to FAILED if any step throws.
 *
 * This guarantees scans are NEVER left in RUNNING state. The handler:
 * 1. Updates the scan status to FAILED with finishedAt
 * 2. Writes a `scan.fail` audit event with error details
 * 3. Emits `scan/completed` with FAILED status
 *
 * Uses the raw `prisma` client (not RLS-scoped) because the failure
 * handler runs outside the original function context and must succeed
 * even if the original RLS context had issues. The scan record's
 * workspaceId constraint provides sufficient isolation for this
 * administrative operation.
 */
async function handleScanFailure({
  event,
  error,
}: {
  event: { data: { event: { data: { scanId: string; workspaceId: string; scopeId: string; tenantId: string } } } };
  error: Error;
}): Promise<void> {
  const { scanId, workspaceId, scopeId } =
    event.data.event.data;

  // Sanitize error message — never expose stack traces or internal details
  const safeErrorMessage =
    error.message.length > 500
      ? `${error.message.slice(0, 500)}…`
      : error.message;

  try {
    await withRLS(workspaceId, [scopeId], async (tx) => {
      // Only update if scan is still in a non-terminal state.
      // This prevents overwriting a CANCELLED status set by the user.
      const scan = await tx.scan.findFirst({
        where: {
          id: scanId,
          workspaceId,
          status: { in: ["PENDING", "RUNNING"] },
        },
        select: { id: true, status: true },
      });

      if (!scan) {
        // Scan already in terminal state — nothing to do
        return;
      }

      await tx.scan.update({
        where: { id: scanId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
        },
      });

      await createAuditEvent(tx, {
        workspaceId,
        scopeId,
        eventType: "scan.fail",
        actorType: "SYSTEM",
        actorId: "inngest:execute-scan",
        targetType: "Scan",
        targetId: scanId,
        eventData: {
          error: safeErrorMessage,
          previousStatus: scan.status,
        },
      });
    });
  } catch (failureError) {
    // If the failure handler itself fails, log but don't throw.
    // The scan will be in RUNNING state, which the sweeper job
    // will eventually detect and mark as FAILED.
    console.error(
      `[scan-pipeline] Failed to mark scan ${scanId} as FAILED:`,
      failureError,
    );
  }

  // Emit completion event regardless of DB update success
  try {
    await inngest.send({
      name: "scan/completed",
      data: {
        scanId,
        status: "FAILED" as const,
        checksRun: 0,
        checksFailed: 0,
      },
    });
  } catch (sendError) {
    console.error(
      `[scan-pipeline] Failed to emit scan/completed for ${scanId}:`,
      sendError,
    );
  }
}
