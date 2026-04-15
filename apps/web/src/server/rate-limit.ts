/**
 * @module server/rate-limit
 *
 * In-memory fixed-window rate limiter for Watchtower's tRPC layer.
 *
 * Three tiers enforce different limits per §11 of API-Conventions.md:
 *
 * | Tier     | Limit   | Window | Scope                  |
 * |----------|---------|--------|------------------------|
 * | query    | 100 req | 60 s   | per user per workspace |
 * | mutation |  30 req | 60 s   | per user per workspace |
 * | auth     |  10 req | 60 s   | per IP                 |
 *
 * Design choice: in-memory Map with fixed-window counters. This is the
 * correct approach for a single-NUC deployment — no Redis, no Postgres
 * round-trips on the hot path. A periodic cleanup timer evicts expired
 * entries to prevent unbounded memory growth.
 *
 * When to revisit: if Watchtower moves to multi-node, swap this for a
 * Postgres- or Redis-backed implementation behind the same interface.
 */

// ---------------------------------------------------------------------------
// Rate-limit configuration
// ---------------------------------------------------------------------------

/**
 * Rate limiting configuration for a single tier.
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  readonly maxRequests: number;
  /** Window duration in milliseconds. */
  readonly windowMs: number;
}

/**
 * Pre-defined rate limit tiers aligned with API-Conventions.md §11.
 *
 * - **query** — 100 requests / 60 s, scoped per user per workspace
 * - **mutation** — 30 requests / 60 s, scoped per user per workspace
 * - **auth** — 10 requests / 60 s, scoped per IP address
 */
export const RATE_LIMIT_TIERS = {
  query: { maxRequests: 100, windowMs: 60_000 },
  mutation: { maxRequests: 30, windowMs: 60_000 },
  auth: { maxRequests: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

/** Discriminated union of supported rate-limit tier names. */
export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;

// ---------------------------------------------------------------------------
// Rate-limit result
// ---------------------------------------------------------------------------

/**
 * Result of a rate limit check, containing all data needed to populate
 * response headers and decide whether to allow the request.
 */
export interface RateLimitResult {
  /** Whether the request is allowed (`true`) or should be rejected. */
  allowed: boolean;
  /** The maximum number of requests permitted in the current window. */
  limit: number;
  /** How many requests remain before the limit is reached. */
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetMs: number;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * A single fixed-window counter for one `tier:key` combination.
 */
interface WindowEntry {
  /** Number of requests recorded in the current window. */
  count: number;
  /** The `Date.now()` timestamp when this window opened. */
  windowStart: number;
}

/**
 * Global store keyed by `"${tier}:${key}"`.
 *
 * In a single-threaded Bun/Node runtime, Map operations are atomic within
 * a single event-loop tick — no mutex required.
 */
const store = new Map<string, WindowEntry>();

// ---------------------------------------------------------------------------
// Cleanup timer
// ---------------------------------------------------------------------------

/** Interval handle so tests can clear it. */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Interval between cleanup sweeps (ms). */
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Remove entries whose window has expired. This prevents unbounded memory
 * growth when many unique keys cycle through the limiter.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();

  store.forEach((entry, compositeKey) => {
    // Derive the tier from the composite key ("tier:rest-of-key").
    // Limit split to 2 parts so colons inside the key are harmless.
    const tierName = compositeKey.split(":", 2)[0] as RateLimitTier;
    const config = RATE_LIMIT_TIERS[tierName];

    // If the tier is unrecognised (should not happen), evict defensively
    if (!config) {
      store.delete(compositeKey);
      return;
    }

    if (now >= entry.windowStart + config.windowMs) {
      store.delete(compositeKey);
    }
  });
}

/**
 * Ensure the periodic cleanup timer is running. Called lazily on the first
 * `checkRateLimit` invocation so the timer is never started in modules
 * that only import types.
 */
function ensureCleanupTimer(): void {
  if (cleanupTimer !== null) return;

  cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);

  // Allow the process to exit naturally even if the timer is still active.
  // Bun and Node both support `Timer.unref()`.
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Check and consume a rate limit token for the given tier and key.
 *
 * If the current fixed window has expired, a new window is started
 * automatically. The counter is always incremented — even when the request
 * is denied — so that repeated abuse does not "reset" the window.
 *
 * @param tier - The rate limit tier (`query`, `mutation`, or `auth`).
 * @param key  - A scope-unique key:
 *               `"${userId}:${workspaceId}"` for query/mutation,
 *               the client IP address for auth.
 * @returns A {@link RateLimitResult} containing allow/deny plus header data.
 *
 * @example
 * ```ts
 * const result = checkRateLimit("query", `${ctx.session.userId}:${ctx.session.workspaceId}`);
 * if (!result.allowed) {
 *   throwWatchtowerError(WATCHTOWER_ERRORS.RATE_LIMIT.EXCEEDED);
 * }
 * ```
 */
export function checkRateLimit(
  tier: RateLimitTier,
  key: string,
): RateLimitResult {
  ensureCleanupTimer();

  const config = RATE_LIMIT_TIERS[tier];
  const compositeKey = `${tier}:${key}`;
  const now = Date.now();

  let entry = store.get(compositeKey);

  // Start a new window if none exists or the previous one has expired.
  if (!entry || now >= entry.windowStart + config.windowMs) {
    entry = { count: 0, windowStart: now };
    store.set(compositeKey, entry);
  }

  // Always increment — even on denial — to prevent reset-by-spam.
  entry.count += 1;

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetMs = Math.max(0, entry.windowStart + config.windowMs - now);

  return { allowed, limit: config.maxRequests, remaining, resetMs };
}

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

/**
 * Compute standard rate-limit response headers from a {@link RateLimitResult}.
 *
 * Returns the three headers recommended by the IETF `RateLimit` draft and
 * widely adopted across REST APIs:
 *
 * - `X-RateLimit-Limit` — max requests per window
 * - `X-RateLimit-Remaining` — tokens left in current window
 * - `X-RateLimit-Reset` — Unix epoch (seconds) when the window resets
 *
 * @param result - The result from {@link checkRateLimit}.
 * @returns A plain object suitable for spreading into HTTP response headers.
 *
 * @example
 * ```ts
 * const headers = rateLimitHeaders(result);
 * // { "X-RateLimit-Limit": "100", "X-RateLimit-Remaining": "95", "X-RateLimit-Reset": "1650000060" }
 * ```
 */
export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  const resetEpochSeconds = Math.ceil((Date.now() + result.resetMs) / 1000);

  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(resetEpochSeconds),
  };
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Reset all rate limit state — counters **and** the cleanup timer.
 *
 * **Test-only.** Calling this in production will silently drop all active
 * rate-limit windows, effectively allowing a burst of traffic through.
 *
 * @internal
 */
export function _resetRateLimitState(): void {
  store.clear();

  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
