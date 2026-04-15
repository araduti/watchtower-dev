/**
 * AdapterError — structured error for vendor adapter failures.
 *
 * All adapter errors are caught at the adapter boundary and wrapped
 * in this class. Raw vendor errors (e.g., Graph SDK exceptions)
 * never escape the adapter — callers only see AdapterError.
 *
 * Maps to Watchtower error codes in the VENDOR domain:
 * - WATCHTOWER:VENDOR:GRAPH_ERROR
 * - WATCHTOWER:VENDOR:RATE_LIMITED
 * - WATCHTOWER:VENDOR:INSUFFICIENT_SCOPE
 */

import type { WatchtowerErrorDef } from "@watchtower/errors";

/**
 * Categorisation of adapter failures for retry and error handling.
 */
export type AdapterErrorKind =
  /** Transient error — safe to retry. */
  | "transient"
  /** Rate limited by vendor — retry after delay. */
  | "rate_limited"
  /** Missing API permissions — not retryable without user action. */
  | "insufficient_scope"
  /** Credentials expired or revoked — not retryable. */
  | "credentials_invalid"
  /** Permanent error — do not retry. */
  | "permanent";

/**
 * Structured error thrown by vendor adapters.
 *
 * Provides enough context for the scan pipeline to decide on
 * retry strategy, user notification, and evidence recording.
 */
export class AdapterError extends Error {
  /** Error category for retry/handling decisions. */
  readonly kind: AdapterErrorKind;

  /** The vendor (e.g., "microsoft-graph", "exchange-online"). */
  readonly vendor: string;

  /** The data source that failed (e.g., "conditionalAccessPolicies"). */
  readonly dataSource: string;

  /** HTTP status code from the vendor, if available. */
  readonly vendorStatusCode: number | undefined;

  /** Retry-After header value in seconds, if the vendor provided one. */
  readonly retryAfterSeconds: number | undefined;

  /** The Watchtower error definition to use when surfacing this error. */
  readonly watchtowerError: WatchtowerErrorDef;

  constructor(opts: {
    message: string;
    kind: AdapterErrorKind;
    vendor: string;
    dataSource: string;
    vendorStatusCode?: number;
    retryAfterSeconds?: number;
    watchtowerError: WatchtowerErrorDef;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "AdapterError";
    this.kind = opts.kind;
    this.vendor = opts.vendor;
    this.dataSource = opts.dataSource;
    this.vendorStatusCode = opts.vendorStatusCode;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.watchtowerError = opts.watchtowerError;
  }

  /** Whether this error is safe to retry. */
  get retryable(): boolean {
    return this.kind === "transient" || this.kind === "rate_limited";
  }
}
