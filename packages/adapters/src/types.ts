/**
 * Core adapter types — the contract all vendor adapters implement.
 *
 * Every vendor adapter (Microsoft Graph, future connectors) implements
 * the `VendorAdapter` interface. The adapter is the ONLY place where:
 * - Encrypted credentials are decrypted
 * - Vendor SDK clients are constructed
 * - Vendor-specific errors are caught and translated
 * - Rate limiting per (workspaceId, tenantId) is enforced
 * - Retries for transient failures are attempted
 *
 * @see docs/Code-Conventions.md §6
 */

/**
 * Configuration passed to every adapter call. Contains the identity
 * context needed to enforce rate limiting and credential lookup.
 */
export interface AdapterConfig {
  /** Workspace ID for rate limiting and credential scoping. */
  readonly workspaceId: string;

  /** Tenant ID for rate limiting and credential lookup. */
  readonly tenantId: string;

  /** Encrypted credentials blob from the Tenant record. */
  readonly encryptedCredentials: Buffer;

  /** Authentication method for the tenant. */
  readonly authMethod: "CLIENT_SECRET" | "WORKLOAD_IDENTITY";

  /** Trace ID for correlation across adapter calls and audit log. */
  readonly traceId: string;

  /**
   * Optional dependency map carrying data already collected by other
   * adapters in the same scan.  Used by adapters whose collection logic
   * depends on the output of another adapter — e.g. the DNS adapter needs
   * the verified-domain list collected by the Graph adapter.
   *
   * Keys are source names (matching the producer adapter's `listSources()`
   * entries), values are the raw collected payload as stored on
   * `Evidence.rawEvidence`.  The scan pipeline populates this map by
   * collecting "leader" sources first.
   */
  readonly dependencies?: Readonly<Record<string, unknown>>;
}

/**
 * Result of an adapter call. Wraps the raw vendor response with
 * metadata needed by the scan pipeline.
 */
export interface AdapterResult<T> {
  /** The collected data. */
  readonly data: T;

  /** ISO 8601 timestamp when the data was collected. */
  readonly collectedAt: string;

  /** Number of API calls consumed (for billing/rate tracking). */
  readonly apiCallCount: number;

  /**
   * Scopes that were required but missing. Empty if all scopes
   * were available. Non-empty means partial data — the caller
   * decides whether to treat this as an error or a degraded result.
   */
  readonly missingScopes: readonly string[];
}

/**
 * The contract all vendor adapters implement.
 *
 * Each method corresponds to a logical data source (e.g.,
 * "conditional access policies", "directory roles"). The adapter
 * translates between the vendor's API shape and Watchtower's
 * internal data model.
 *
 * Adapters are stateless — all context is passed via `AdapterConfig`.
 * The scan pipeline creates one adapter instance per scan and calls
 * methods in sequence (or parallel, depending on rate limits).
 *
 * @typeParam TDataSources - Map of data source keys to their return types.
 */
export interface VendorAdapter<
  TDataSources extends Record<string, unknown>,
> {
  /** Human-readable adapter name for logging. */
  readonly name: string;

  /**
   * Collect data from a single data source.
   *
   * @param source - The data source key to collect.
   * @param config - Adapter configuration with credentials and context.
   * @returns The collected data wrapped in an AdapterResult.
   * @throws AdapterError — never raw vendor errors.
   */
  collect<K extends keyof TDataSources & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<TDataSources[K]>>;

  /**
   * List the data sources this adapter supports.
   * Used by the scan pipeline to determine which sources to collect.
   */
  listSources(): readonly (keyof TDataSources & string)[];

  /**
   * Check which Graph scopes (or equivalent vendor permissions)
   * the adapter requires for a given data source.
   */
  requiredScopes<K extends keyof TDataSources & string>(
    source: K,
  ): readonly string[];
}
