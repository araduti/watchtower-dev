/**
 * Per-(workspace, tenant) concurrency limiter shared by every vendor adapter.
 *
 * Vendor APIs apply rate limits per tenant identity, so concurrency must be
 * isolated per `(workspaceId, tenantId)` tuple — never global.  All adapters
 * acquire from the same cache so a noisy tenant cannot starve a quiet one
 * sharing the same process, but two adapters working on the same tenant share
 * the same window and back off together.
 *
 * @see docs/decisions/003-vendor-adapter-boundary.md (rate limiting per tuple)
 */

/**
 * Simple counting semaphore.  Internal — exported only for adapter consumers
 * that need to reference the type for instance-level fields.
 */
export class ConcurrencySemaphore {
  private readonly waiters: Array<() => void> = [];
  private active = 0;

  constructor(private readonly maxConcurrency: number) {}

  /** Acquire a slot.  Resolves when a slot is available. */
  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  /** Release a slot, unblocking the next waiter. */
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the slot directly to the next waiter — active count is unchanged.
      next();
    } else {
      this.active--;
    }
  }
}

/**
 * Per-vendor semaphore cache.  Keyed by `vendor:workspaceId:tenantId` so that
 * different vendors (Graph, Exchange, Teams, …) don't share concurrency
 * windows even for the same tenant — vendor rate limits are independent.
 */
const semaphoreCache = new Map<string, ConcurrencySemaphore>();

/**
 * Get or create the concurrency semaphore for a `(vendor, workspace, tenant)`
 * tuple.  The semaphore is created on first use and reused thereafter.
 *
 * @param vendor          - Vendor name (e.g. "exchange-online").
 * @param workspaceId     - Watchtower workspace ID.
 * @param tenantId        - Watchtower tenant record ID.
 * @param maxConcurrency  - Cap to apply on first creation.  Subsequent calls
 *                          do NOT change the cap of an existing semaphore;
 *                          the first caller wins, which keeps behaviour
 *                          deterministic across data sources within an
 *                          adapter.
 */
export function getTenantSemaphore(
  vendor: string,
  workspaceId: string,
  tenantId: string,
  maxConcurrency: number,
): ConcurrencySemaphore {
  const key = `${vendor}:${workspaceId}:${tenantId}`;
  let sem = semaphoreCache.get(key);
  if (!sem) {
    sem = new ConcurrencySemaphore(maxConcurrency);
    semaphoreCache.set(key, sem);
  }
  return sem;
}
