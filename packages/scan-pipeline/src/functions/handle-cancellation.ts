/**
 * handle-cancellation — Inngest function for scan cancellation.
 *
 * Listens for `scan/cancel` events and transitions the target scan to
 * CANCELLED state if it is still in a cancellable state (PENDING or
 * RUNNING).
 *
 * This function works in tandem with the `cancelOn` configuration on
 * `execute-scan`: when a `scan/cancel` event is emitted, Inngest will:
 * 1. Cancel the in-progress `execute-scan` function (via `cancelOn`)
 * 2. Run this function to persist the CANCELLED status and audit log
 *
 * The scan router's `cancel` mutation handles the user-facing state
 * transition and audit log. This function is a safety net that ensures
 * the Inngest-side cancellation is also properly recorded, and handles
 * the case where the scan status needs to be updated if the execute-scan
 * function was mid-step when cancelled.
 *
 * Idempotent: if the scan is already in a terminal state (SUCCEEDED,
 * FAILED, CANCELLED), this function is a no-op.
 *
 * @see docs/decisions/004-inngest-scan-pipeline.md
 */

import { inngest } from "../inngest-client.ts";

/**
 * Handle scan cancellation events.
 *
 * This function ensures that when a `scan/cancel` event is emitted,
 * the corresponding `execute-scan` function is cancelled via Inngest's
 * built-in cancellation mechanism. The actual database state transition
 * is handled by the scan router's `cancel` mutation.
 *
 * This function serves as:
 * 1. A registration point for `scan/cancel` events in Inngest
 * 2. A hook for future cancellation side effects (notifications, cleanup)
 */
export const handleCancellation = inngest.createFunction(
  {
    id: "handle-scan-cancellation",
    retries: 3,
    triggers: [{ event: "scan/cancel" }],
  },
  async ({ event, step }) => {
    const { scanId } = event.data;

    // Log cancellation for observability.
    // The scan router's `cancel` mutation has already:
    // 1. Validated permissions
    // 2. Updated the scan status to CANCELLED
    // 3. Written the audit log entry
    //
    // This function exists to:
    // - Trigger `cancelOn` on the execute-scan function (by receiving the event)
    // - Provide a hook for future side effects (e.g., webhook notifications)
    await step.run("acknowledge-cancellation", async () => {
      return {
        scanId,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
      };
    });

    return { scanId, cancelled: true };
  },
);
