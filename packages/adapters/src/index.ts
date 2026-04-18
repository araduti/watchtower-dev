/**
 * @watchtower/adapters — Vendor adapter boundary
 *
 * This package defines the interface and types for vendor adapters.
 * All vendor SDK calls go through adapters — no vendor SDK imports
 * are allowed outside this package (Code-Conventions §6).
 *
 * Key design principles:
 * - Credentials are decrypted at the adapter boundary ONLY
 * - Vendor errors are translated into Watchtower error codes
 * - Retries live inside the adapter
 * - Rate limiting is per (workspaceId, tenantId) tuple
 * - Adapters are the test seam — mock adapters, not HTTP
 *
 * @see docs/Code-Conventions.md §6
 * @see docs/decisions/003-vendor-adapter-boundary.md
 */

export type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
export type {
  GraphAdapterConfig,
  GraphDataSources,
  GraphDataSourceKey,
} from "./graph-types.ts";
export { AdapterError } from "./adapter-error.ts";
export { MicrosoftGraphAdapter, createGraphAdapter } from "./graph-adapter.ts";
export {
  encryptCredentials,
  verifyCredentials,
  verifyEncryptedCredentials,
  type CredentialInput,
} from "./credential-utils.ts";
