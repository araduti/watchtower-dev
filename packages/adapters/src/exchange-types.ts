/**
 * Exchange Online adapter — types & data source registry.
 *
 * Each key in {@link ExchangeDataSources} corresponds to one Exchange /
 * Defender PowerShell cmdlet invoked over the undocumented InvokeCommand
 * REST endpoint that the ExchangeOnlineManagement PowerShell module uses
 * internally.  The transport is unsupported by Microsoft and may change
 * without notice — see the adapter implementation for retry/backoff and
 * error translation.
 *
 * The data shapes are intentionally `Record<string, unknown>` (or arrays
 * thereof) because Microsoft does not publish stable schemas for these
 * cmdlet outputs.  Evaluators downstream read individual properties by
 * name with defensive defaults; adding fields to a cmdlet response is a
 * non-breaking change.
 */

/** Configuration specific to the Exchange Online adapter. */
export interface ExchangeAdapterConfig {
  /** Maximum concurrent InvokeCommand calls per tenant. Default: 4. */
  readonly maxConcurrency?: number;
}

/**
 * Map of Exchange Online / Defender data sources.  Values are arrays of
 * cmdlet result objects (camelCased on the way in).
 */
export interface ExchangeDataSources {
  readonly [key: string]: unknown;

  // ── exchange-online ─────────────────────────────────────────────────────
  organizationConfig: ReadonlyArray<Record<string, unknown>>;
  userMailboxes: ReadonlyArray<Record<string, unknown>>;
  mailboxAuditBypassAssociations: ReadonlyArray<Record<string, unknown>>;
  sharingPolicies: ReadonlyArray<Record<string, unknown>>;
  transportConfig: ReadonlyArray<Record<string, unknown>>;
  owaMailboxPolicies: ReadonlyArray<Record<string, unknown>>;
  externalInOutlook: ReadonlyArray<Record<string, unknown>>;
  roleAssignmentPolicies: ReadonlyArray<Record<string, unknown>>;
  /** Exchange Online transport rules (`Get-TransportRule`). */
  transportRules: ReadonlyArray<Record<string, unknown>>;

  // ── defender for o365 ────────────────────────────────────────────────────
  adminAuditLogConfig: ReadonlyArray<Record<string, unknown>>;
  safeLinksPolicies: ReadonlyArray<Record<string, unknown>>;
  safeAttachmentPolicies: ReadonlyArray<Record<string, unknown>>;
  malwareFilterPolicies: ReadonlyArray<Record<string, unknown>>;
  malwareFilterRules: ReadonlyArray<Record<string, unknown>>;
  hostedConnectionFilterPolicies: ReadonlyArray<Record<string, unknown>>;
  hostedContentFilterPolicies: ReadonlyArray<Record<string, unknown>>;
  hostedOutboundSpamFilterPolicies: ReadonlyArray<Record<string, unknown>>;
  antiPhishPolicies: ReadonlyArray<Record<string, unknown>>;
  atpPolicyForO365: ReadonlyArray<Record<string, unknown>>;
  atpProtectionPolicyRules: ReadonlyArray<Record<string, unknown>>;
  teamsProtectionPolicies: ReadonlyArray<Record<string, unknown>>;
  teamsProtectionPolicyRules: ReadonlyArray<Record<string, unknown>>;
}

export type ExchangeDataSourceKey = keyof ExchangeDataSources;
