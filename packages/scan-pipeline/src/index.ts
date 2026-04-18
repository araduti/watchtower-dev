/**
 * @watchtower/scan-pipeline — Public API
 *
 * The scan pipeline package provides Inngest functions that orchestrate
 * the compliance scan lifecycle:
 *
 * 1. `executeScan` — Main pipeline: PENDING → RUNNING → SUCCEEDED | FAILED
 * 2. `handleCancellation` — Cancellation handler for in-progress scans
 *
 * Usage:
 *
 * ```typescript
 * // In the Inngest worker serve() call:
 * import { inngest, scanFunctions } from "@watchtower/scan-pipeline";
 *
 * serve({ client: inngest, functions: scanFunctions });
 *
 * // In the scan router to send events:
 * import { inngest } from "@watchtower/scan-pipeline";
 *
 * await inngest.send({
 *   name: "scan/execute",
 *   data: { scanId, workspaceId, tenantId, scopeId },
 * });
 * ```
 *
 * @see docs/decisions/004-inngest-scan-pipeline.md
 */

// -- Inngest client --
export { inngest } from "./inngest-client.ts";

// -- Dev server probe (diagnostic) --
export { probeDevServer } from "./inngest-client.ts";

// -- Event types --
export type {
  ScanPipelineEvents,
  ScanExecutePayload,
  ScanCompletedPayload,
  ScanCancelPayload,
} from "./events.ts";

// -- Functions --
export { executeScan } from "./functions/execute-scan.ts";
export { handleCancellation } from "./functions/handle-cancellation.ts";
export { sweepIdempotencyKeys } from "./functions/sweep-idempotency-keys.ts";

/**
 * All scan pipeline functions, ready for Inngest `serve()`.
 *
 * Pass this array to `serve({ functions: scanFunctions })` in the
 * worker process to register all scan pipeline functions at once.
 */
export { scanFunctions } from "./functions.ts";
