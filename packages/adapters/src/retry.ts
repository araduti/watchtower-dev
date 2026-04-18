/**
 * Generic retry-with-backoff helper used by every vendor adapter.
 *
 * Behaviour:
 *   - Retries 429 and 5xx up to MAX_RETRIES times (4 attempts total).
 *   - Honours `Retry-After` (seconds) when the vendor provides it.
 *   - Exponential backoff with jitter otherwise: BASE * 2^attempt + rand.
 *   - All other status codes (4xx except 429, network errors) are translated
 *     immediately and rethrown without retry.
 *
 * Each adapter supplies its own inspector (parses vendor-specific error
 * shape) and translator (converts to `AdapterError`) — the loop logic is
 * shared.
 */

import { AdapterError, type AdapterErrorKind } from "./adapter-error.ts";

/** Maximum number of retries (4 total attempts). */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds. */
const BASE_DELAY_MS = 1_000;

/** Maximum delay cap for backoff in milliseconds. */
const MAX_DELAY_MS = 30_000;

/**
 * Result of inspecting a thrown error to decide whether the adapter should
 * retry.  Adapters supply their own inspector so they can read whatever
 * shape their HTTP client produces.
 */
export interface RetryDecision {
  /** Whether to retry this error. */
  readonly retryable: boolean;
  /**
   * Optional vendor-supplied delay in milliseconds (e.g. from the
   * `Retry-After` header).  When provided, the helper waits at least this
   * long before the next attempt.
   */
  readonly retryAfterMs?: number;
}

/**
 * Inspector callback supplied by each adapter — looks at an unknown thrown
 * value and decides whether it is retryable plus the vendor-supplied delay.
 */
export type RetryInspector = (err: unknown) => RetryDecision;

/**
 * Translator callback supplied by each adapter — converts an unknown thrown
 * value into the adapter's typed `AdapterError`.  Called once retries are
 * exhausted (or the error is not retryable).
 */
export type ErrorTranslator = (err: unknown) => AdapterError;

/**
 * Run an async fn with the standard retry policy described above.
 *
 * @param fn         - The async operation to run.
 * @param inspect    - Adapter-specific retry decision logic.
 * @param translate  - Adapter-specific error translation (final, non-retryable).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  inspect: RetryInspector,
  translate: ErrorTranslator,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const decision = inspect(err);

      if (!decision.retryable || attempt === MAX_RETRIES) {
        throw translate(err);
      }

      const backoffMs = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1_000,
        MAX_DELAY_MS,
      );
      const waitMs = decision.retryAfterMs ?? backoffMs;
      await sleep(waitMs);
    }
  }

  // Unreachable: the loop either returns or throws.  Defensive throw to
  // satisfy the type checker.
  throw translate(new Error("Exhausted retry attempts."));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Standard kind classification for an HTTP status code.  Used by per-adapter
 * `translateError` functions so they all categorise the same way.
 */
export function classifyHttpStatus(
  status: number | undefined,
): AdapterErrorKind {
  if (status === 429) return "rate_limited";
  if (status === 401) return "credentials_invalid";
  if (status === 403) return "insufficient_scope";
  if (status === 404) return "resource_not_found";
  if (status !== undefined && status >= 500) return "transient";
  return "permanent";
}
