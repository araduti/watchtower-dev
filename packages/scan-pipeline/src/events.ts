/**
 * Scan pipeline event type definitions.
 *
 * Defines the Inngest event schemas for the scan lifecycle. Each event
 * carries a strongly-typed payload that the corresponding Inngest
 * function validates at runtime.
 *
 * Event naming follows Inngest conventions: `domain/verb` in lowercase.
 *
 * @see docs/decisions/004-inngest-scan-pipeline.md
 */

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

/**
 * Payload for the `scan/execute` event.
 *
 * Triggered when a scan is created (by `scan.trigger` tRPC mutation).
 * The Inngest function picks up this event and runs the full scan
 * pipeline: PENDING → RUNNING → SUCCEEDED | FAILED.
 */
export interface ScanExecutePayload {
  /** The scan record ID (CUID). */
  readonly scanId: string;

  /** Workspace ID for RLS scoping. */
  readonly workspaceId: string;

  /** Tenant ID for credential lookup and adapter config. */
  readonly tenantId: string;

  /** Scope ID for audit log entries. */
  readonly scopeId: string;
}

/**
 * Payload for the `scan/completed` event.
 *
 * Emitted when a scan finishes (either successfully or with failure).
 * Downstream consumers (notifications, webhooks, billing) can subscribe
 * to this event to react to scan completion.
 */
export interface ScanCompletedPayload {
  /** The scan record ID (CUID). */
  readonly scanId: string;

  /** Terminal scan status. */
  readonly status: "SUCCEEDED" | "FAILED";

  /** Number of checks that were executed. */
  readonly checksRun: number;

  /** Number of checks that failed. */
  readonly checksFailed: number;
}

/**
 * Payload for the `scan/cancel` event.
 *
 * Emitted when a user requests cancellation of an in-progress scan.
 * The execute-scan function listens for this to abort gracefully.
 */
export interface ScanCancelPayload {
  /** The scan record ID (CUID) to cancel. */
  readonly scanId: string;
}

// ---------------------------------------------------------------------------
// Inngest event map
// ---------------------------------------------------------------------------

/**
 * Complete map of scan pipeline events.
 *
 * Used as the type parameter for the Inngest client to enforce
 * type-safe event sending and function registration.
 */
export interface ScanPipelineEvents {
  "scan/execute": {
    data: ScanExecutePayload;
  };
  "scan/completed": {
    data: ScanCompletedPayload;
  };
  "scan/cancel": {
    data: ScanCancelPayload;
  };
}
