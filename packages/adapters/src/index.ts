/**
 * @watchtower/adapters — Vendor adapter boundary
 *
 * This package defines the interface and types for vendor adapters.
 * All vendor SDK calls go through adapters — no vendor SDK imports
 * are allowed outside this package (Code-Conventions §6).
 *
 * Key design principles:
 * - Credentials are decrypted at the adapter boundary ONLY (shared
 *   `decryptCredentialBundle` helper — single AES-256-GCM code path)
 * - Vendor errors are translated into Watchtower error codes
 * - Retries live inside the adapter (shared `withRetry` helper)
 * - Rate limiting is per (vendor, workspaceId, tenantId) tuple
 * - Adapters are the test seam — mock adapters, not HTTP
 *
 * @see docs/Code-Conventions.md §6
 * @see docs/decisions/003-vendor-adapter-boundary.md
 */

// Core contract ------------------------------------------------------------
export type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
export { AdapterError } from "./adapter-error.ts";
export type { AdapterErrorKind } from "./adapter-error.ts";

// Credential bundle (shared decryption shape) ------------------------------
export {
  credentialBundleSchema,
  parseCredentialBundle,
  type CredentialBundle,
} from "./credential-bundle.ts";
export { decryptCredentialBundle } from "./credential-decrypt.ts";
export {
  encryptCredentials,
  verifyCredentials,
  verifyEncryptedCredentials,
  type CredentialInput,
} from "./credential-utils.ts";

// Microsoft Graph adapter --------------------------------------------------
export type {
  GraphAdapterConfig,
  GraphDataSources,
  GraphDataSourceKey,
  VerifiedDomain,
} from "./graph-types.ts";
export { MicrosoftGraphAdapter, createGraphAdapter } from "./graph-adapter.ts";

// Exchange adapter ---------------------------------------------------------
export type {
  ExchangeAdapterConfig,
  ExchangeDataSources,
  ExchangeDataSourceKey,
} from "./exchange-types.ts";
export { ExchangeAdapter, createExchangeAdapter } from "./exchange-adapter.ts";

// SharePoint adapter -------------------------------------------------------
export {
  SharePointAdapter,
  createSharePointAdapter,
  type SharePointAdapterConfig,
  type SharePointDataSources,
  type SharePointDataSourceKey,
} from "./sharepoint-adapter.ts";

// Teams adapter ------------------------------------------------------------
export {
  TeamsAdapter,
  createTeamsAdapter,
  type TeamsAdapterConfig,
  type TeamsDataSources,
  type TeamsDataSourceKey,
} from "./teams-adapter.ts";

// Compliance adapter -------------------------------------------------------
export {
  ComplianceAdapter,
  createComplianceAdapter,
  type ComplianceAdapterConfig,
  type ComplianceDataSources,
  type ComplianceDataSourceKey,
} from "./compliance-adapter.ts";

// DNS adapter --------------------------------------------------------------
export {
  DnsAdapter,
  createDnsAdapter,
  type DnsAdapterConfig,
  type DnsDataSources,
  type DnsDataSourceKey,
  type DomainDnsRecords,
} from "./dns-adapter.ts";
