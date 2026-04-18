/**
 * execute-scan — the main Inngest function for the scan pipeline.
 *
 * Orchestrates the full scan lifecycle using Inngest steps for durability:
 *
 *   1. transition-to-running — Guard PENDING status, set RUNNING
 *   2. collect-data          — Invoke the adapter for each data source
 *   3. store-evidence        — Run engine, upsert Findings, create Evidence
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
import type { PrismaTransactionClient } from "@watchtower/db";
import { createGraphAdapter } from "@watchtower/adapters";
import type { AdapterConfig, AdapterResult } from "@watchtower/adapters";
import {
  evaluateAssertions,
} from "@watchtower/engine";
import type {
  EngineAssertion,
  EngineConfig,
  EngineResult,
  EvidenceSnapshot,
} from "@watchtower/engine";

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

    console.info(
      `[scan-pipeline:execute] starting: scanId=${scanId} workspaceId=${workspaceId} tenantId=${tenantId} scopeId=${scopeId}`,
    );

    // ------------------------------------------------------------------
    // Step 1: Transition PENDING → RUNNING
    // ------------------------------------------------------------------
    const tenant = await step.run("transition-to-running", async () => {
      console.info(`[scan-pipeline:execute] step=transition-to-running start: scanId=${scanId}`);
      const result = await withRLS(workspaceId, [scopeId], async (tx) => {
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

        if (
          !tenantRecord.encryptedCredentials ||
          tenantRecord.encryptedCredentials.length === 0
        ) {
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

        // Prisma 7 returns Bytes as Uint8Array which may have a
        // non-zero byteOffset in Bun.  Copy into a clean Buffer
        // before base64-encoding to avoid garbled output.
        const credBytes = tenantRecord.encryptedCredentials;
        const credCopy = Buffer.alloc(credBytes.length);
        Buffer.from(credBytes).copy(credCopy);

        return {
          msTenantId: tenantRecord.msTenantId,
          encryptedCredentials: credCopy.toString("base64"),
          authMethod: tenantRecord.authMethod as
            | "CLIENT_SECRET"
            | "WORKLOAD_IDENTITY",
        };
      });

      console.info(`[scan-pipeline:execute] step=transition-to-running done: scanId=${scanId}`);
      return result;
    });

    // ------------------------------------------------------------------
    // Step 2: Collect data from all adapter sources
    // ------------------------------------------------------------------
    const collectedSources = await step.run("collect-data", async () => {
      console.info(`[scan-pipeline:execute] step=collect-data start: scanId=${scanId}`);
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

      console.info(
        `[scan-pipeline:execute] step=collect-data done: scanId=${scanId} sourcesCollected=${results.length}`,
      );
      return results;
    });

    // ------------------------------------------------------------------
    // Step 3: Run engine + store Evidence/Finding records
    // ------------------------------------------------------------------
    const evidenceSummary = await step.run("store-evidence", async () => {
      console.info(`[scan-pipeline:execute] step=store-evidence start: scanId=${scanId}`);

      return await withRLS(workspaceId, [scopeId], async (tx) => {
        // 1. Build evidence snapshot from collected data
        const snapshot: EvidenceSnapshot = {
          data: Object.fromEntries(
            collectedSources.map((s) => [s.source, s.rawData]),
          ),
        };

        // 2. Load ControlAssertions from DB and map to EngineAssertions
        const dbAssertions = await tx.controlAssertion.findMany({
          include: {
            control: {
              include: {
                check: { select: { slug: true, dataSource: true, property: true } },
              },
            },
          },
        });

        if (dbAssertions.length === 0) {
          console.info(`[scan-pipeline:execute] step=store-evidence: no assertions found, skipping engine`);
          return { checksRun: 0, checksFailed: 0 };
        }

        const engineAssertions: EngineAssertion[] = dbAssertions.map((dba) => ({
          checkSlug: dba.checkSlug,
          source: dba.control.check.dataSource ?? "",
          property: dba.control.check.property ?? "",
          operator: dba.operator as EngineAssertion["operator"],
          expectedValue: dba.expectedValue,
          sourceFilter: dba.sourceFilter as Record<string, unknown> | undefined,
          assertionLogic: (dba.control.assertionLogic ?? "ALL") as "ALL" | "ANY",
        }));

        // 3. Run the engine
        const engineConfig: EngineConfig = {
          breakGlassAccounts: (process.env.BREAK_GLASS_ACCOUNTS ?? "")
            .split(",")
            .filter(Boolean),
        };

        const engineResults = evaluateAssertions(
          engineAssertions,
          snapshot,
          engineConfig,
        );

        // 4. Upsert Findings and create Evidence for each result
        let checksRun = 0;
        let checksFailed = 0;

        // Look up Check records for severity info
        const checkSlugs = [...engineResults.keys()];
        const checks = await tx.check.findMany({
          where: { slug: { in: checkSlugs } },
          select: { slug: true, severity: true, severityRank: true },
        });
        const checkMap = new Map(checks.map((c) => [c.slug, c]));

        for (const [checkSlug, result] of engineResults) {
          checksRun++;
          if (!result.pass) checksFailed++;

          const check = checkMap.get(checkSlug);
          const now = new Date();

          // Upsert Finding — one per (tenantId, checkSlug), ever
          const existingFinding = await tx.finding.findUnique({
            where: { tenantId_checkSlug: { tenantId, checkSlug } },
            select: { id: true, status: true, severity: true, severityRank: true },
          });

          const findingData = await upsertFinding(tx, {
            existingFinding,
            result,
            workspaceId,
            scopeId,
            tenantId,
            checkSlug,
            check,
            now,
            scanId,
          });

          // Create Evidence record (append-only)
          await tx.evidence.create({
            data: {
              workspaceId,
              scopeId,
              tenantId,
              scanId,
              findingId: findingData.id,
              result: result.pass ? "PASS" : "FAIL",
              rawEvidence: {
                pass: result.pass,
                warnings: result.warnings,
                // Engine actualValues are always JSON-serializable; cast to
                // satisfy Prisma's InputJsonValue constraint.
                actualValues:
                  result.actualValues as Record<string, import("@prisma/client").Prisma.InputJsonValue | null>,
              },
              type: "AUTOMATED",
              collectedBy: "SYSTEM",
              collectedById: "inngest:execute-scan",
              observedAt: now,
            },
          });

          // Audit: finding status change (if it changed)
          if (findingData.statusChanged) {
            await createAuditEvent(tx, {
              workspaceId,
              scopeId,
              eventType: findingData.isNew ? "finding.created" : "finding.status_changed",
              actorType: "SYSTEM",
              actorId: "inngest:execute-scan",
              targetType: "Finding",
              targetId: findingData.id,
              eventData: {
                checkSlug,
                ...(findingData.isNew
                  ? { status: findingData.newStatus }
                  : { fromStatus: findingData.previousStatus, toStatus: findingData.newStatus }),
                reason: result.pass ? "Engine evaluation passed" : "Engine evaluation failed",
                scanId,
              },
            });
          }
        }

        console.info(
          `[scan-pipeline:execute] step=store-evidence done: ` +
            `scanId=${scanId} checksRun=${checksRun} checksFailed=${checksFailed}`,
        );

        return { checksRun, checksFailed };
      });
    });

    // ------------------------------------------------------------------
    // Step 4: Finalize scan — mark SUCCEEDED
    // ------------------------------------------------------------------
    await step.run("finalize-scan", async () => {
      console.info(`[scan-pipeline:execute] step=finalize-scan start: scanId=${scanId}`);
      await withRLS(workspaceId, [scopeId], async (tx) => {
        await tx.scan.update({
          where: { id: scanId },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            checksRun: evidenceSummary.checksRun,
            checksFailed: evidenceSummary.checksFailed,
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
            checksRun: evidenceSummary.checksRun,
            checksFailed: evidenceSummary.checksFailed,
          },
        });
      });
      console.info(`[scan-pipeline:execute] step=finalize-scan done: scanId=${scanId}`);
    });

    // Emit completion event for downstream consumers
    console.info(`[scan-pipeline:execute] emitting scan/completed: scanId=${scanId} status=SUCCEEDED`);
    await step.sendEvent("emit-scan-completed", {
      name: "scan/completed",
      data: {
        scanId,
        status: "SUCCEEDED" as const,
        checksRun: evidenceSummary.checksRun,
        checksFailed: evidenceSummary.checksFailed,
      },
    });

    return { scanId, status: "SUCCEEDED" as const };
  },
);

// ---------------------------------------------------------------------------
// Finding lifecycle state machine
// ---------------------------------------------------------------------------

/**
 * Finding upsert result — returned by `upsertFinding()`.
 */
interface FindingUpsertResult {
  /** The finding ID (new or existing) */
  id: string;
  /** Whether a new Finding was created */
  isNew: boolean;
  /** Whether the status changed (triggers an audit event) */
  statusChanged: boolean;
  /** Previous status (for audit event data) */
  previousStatus: string | null;
  /** New/current status */
  newStatus: string;
}

/**
 * Upsert a Finding based on engine evaluation results.
 *
 * Implements the Finding lifecycle state machine:
 *
 * - **New failure**: Create Finding with OPEN status
 * - **New pass**: Create Finding with RESOLVED status (evidence shows compliance)
 * - **Existing OPEN/ACKNOWLEDGED/IN_PROGRESS, still failing**: Update lastSeenAt only
 * - **Existing OPEN/ACKNOWLEDGED/IN_PROGRESS, now passing**: Transition to RESOLVED
 * - **Existing RESOLVED, still passing**: Update lastSeenAt only
 * - **Existing RESOLVED, failing again**: Reopen → OPEN, set regressionFromResolvedAt
 * - **Existing ACCEPTED_RISK, still failing**: Leave as-is, update lastSeenAt
 * - **Existing NOT_APPLICABLE**: Leave as-is, update lastSeenAt
 *
 * Severity is copied from the Check at creation time but never overwritten
 * on existing findings (customers may have overridden it).
 *
 * @see docs/Architecture.md §8 — Finding lifecycle
 */
async function upsertFinding(
  tx: PrismaTransactionClient,
  params: {
    existingFinding: { id: string; status: string; severity: string; severityRank: number } | null;
    result: EngineResult;
    workspaceId: string;
    scopeId: string;
    tenantId: string;
    checkSlug: string;
    check: { slug: string; severity: string; severityRank: number } | undefined;
    now: Date;
    scanId: string;
  },
): Promise<FindingUpsertResult> {
  const { existingFinding, result, workspaceId, scopeId, tenantId, checkSlug, check, now } = params;

  // Default severity from check, fallback to MEDIUM
  const severity = (check?.severity ?? "MEDIUM") as "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  const severityRank = check?.severityRank ?? 2;

  // --- New Finding ---
  if (!existingFinding) {
    const newStatus = result.pass ? "RESOLVED" : "OPEN";
    const finding = await tx.finding.create({
      data: {
        workspaceId,
        scopeId,
        tenantId,
        checkSlug,
        status: newStatus,
        severity,
        severityRank,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(result.pass ? { resolvedAt: now, resolvedBy: "inngest:execute-scan" } : {}),
      },
      select: { id: true },
    });

    return {
      id: finding.id,
      isNew: true,
      statusChanged: true,
      previousStatus: null,
      newStatus,
    };
  }

  // --- Existing Finding ---
  const previousStatus = existingFinding.status;

  // Statuses where the engine CAN transition the finding
  const engineManagedStatuses = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];

  // ACCEPTED_RISK and NOT_APPLICABLE: only update lastSeenAt, never change status
  if (!engineManagedStatuses.includes(previousStatus)) {
    await tx.finding.update({
      where: { tenantId_checkSlug: { tenantId, checkSlug } },
      data: { lastSeenAt: now },
    });
    return {
      id: existingFinding.id,
      isNew: false,
      statusChanged: false,
      previousStatus,
      newStatus: previousStatus,
    };
  }

  // Check is now passing
  if (result.pass) {
    if (previousStatus === "RESOLVED") {
      // Already resolved, just update lastSeenAt
      await tx.finding.update({
        where: { tenantId_checkSlug: { tenantId, checkSlug } },
        data: { lastSeenAt: now },
      });
      return { id: existingFinding.id, isNew: false, statusChanged: false, previousStatus, newStatus: "RESOLVED" };
    }

    // Transition to RESOLVED
    await tx.finding.update({
      where: { tenantId_checkSlug: { tenantId, checkSlug } },
      data: {
        status: "RESOLVED",
        lastSeenAt: now,
        resolvedAt: now,
        resolvedBy: "inngest:execute-scan",
      },
    });
    return { id: existingFinding.id, isNew: false, statusChanged: true, previousStatus, newStatus: "RESOLVED" };
  }

  // Check is failing
  if (previousStatus === "RESOLVED") {
    // Regression — was resolved, now failing again
    await tx.finding.update({
      where: { tenantId_checkSlug: { tenantId, checkSlug } },
      data: {
        status: "OPEN",
        lastSeenAt: now,
        regressionFromResolvedAt: now,
        resolvedAt: null,
        resolvedBy: null,
      },
    });
    return { id: existingFinding.id, isNew: false, statusChanged: true, previousStatus: "RESOLVED", newStatus: "OPEN" };
  }

  // Still failing (OPEN, ACKNOWLEDGED, IN_PROGRESS) — update lastSeenAt only
  await tx.finding.update({
    where: { tenantId_checkSlug: { tenantId, checkSlug } },
    data: { lastSeenAt: now },
  });
  return { id: existingFinding.id, isNew: false, statusChanged: false, previousStatus, newStatus: previousStatus };
}

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

  console.info(
    `[scan-pipeline:execute] handleScanFailure entering: scanId=${scanId} error=${error.message}`,
  );

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
