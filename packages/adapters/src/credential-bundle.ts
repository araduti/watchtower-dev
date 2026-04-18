/**
 * Credential bundle — the plaintext shape of a decrypted Tenant credential blob.
 *
 * `Tenant.encryptedCredentials` is an AES-256-GCM sealed JSON document.  After
 * decryption it conforms to {@link CredentialBundle}.  Required fields cover
 * the baseline Microsoft Graph client_credentials flow; optional fields carry
 * the additional secrets needed by sibling vendor adapters that talk to
 * SharePoint CSOM (cert-based auth), the Compliance endpoint (regional tenant
 * name), and other transports.
 *
 * Each adapter reads only the fields it needs.  Adapters that require a missing
 * optional field MUST raise an `AdapterError` of kind `credentials_invalid` so
 * the scan pipeline can downgrade the source rather than crash the whole scan.
 *
 * Backwards compatibility: existing tenants store only the three required
 * fields.  Optional fields default to `undefined` after decryption — the
 * schema below tolerates the older payload shape.
 *
 * @see docs/Code-Conventions.md §6 — Vendor adapter boundary
 * @see docs/decisions/003-vendor-adapter-boundary.md
 */

import { z } from "zod";

/**
 * Zod schema for the decrypted credential bundle.  `passthrough` is rejected
 * — only fields declared here are accepted.  Unknown extra fields would
 * indicate a mismatched encryption key or schema drift and must be surfaced
 * as a credentials_invalid error.
 */
export const credentialBundleSchema = z
  .object({
    /** Azure app-registration client ID (UUID). Required for every flow. */
    clientId: z.string().min(1, "clientId is required"),

    /** Azure app-registration client secret. Required for the baseline
     * client_credentials flow used by Microsoft Graph, Exchange, Teams,
     * and Compliance adapters. */
    clientSecret: z.string().min(1, "clientSecret is required"),

    /** The Microsoft Entra (Azure AD) tenant GUID. */
    msTenantId: z.string().min(1, "msTenantId is required"),

    /**
     * Optional PEM-encoded private key + certificate bundle used by the
     * SharePoint adapter (CSOM rejects client_secret tokens for app-only
     * scenarios — only certificate-based JWT assertions are accepted).
     */
    sharepointCertPem: z.string().optional(),

    /**
     * Optional hex SHA-1 thumbprint of the certificate referenced by
     * {@link sharepointCertPem}.  Required when `sharepointCertPem` is
     * provided.
     */
    sharepointCertThumbprint: z.string().optional(),

    /**
     * Optional SharePoint tenant short name (e.g. `"contoso"` for
     * `contoso-admin.sharepoint.com`).  When omitted, the SharePoint
     * adapter degrades to "not configured" and the related sources
     * are skipped.
     */
    spoTenantName: z.string().optional(),

    /**
     * Optional Compliance endpoint tenant name (e.g.
     * `"contoso.onmicrosoft.com"`).  Defaults derived from
     * {@link spoTenantName} or {@link msTenantId} when omitted.
     */
    complianceTenantName: z.string().optional(),
  })
  .strict();

/**
 * The decrypted credential bundle.  Plaintext lives only inside an adapter
 * closure — it is NEVER returned to the scan pipeline or persisted.
 */
export type CredentialBundle = z.infer<typeof credentialBundleSchema>;

/**
 * Type guard / parser for already-decoded JSON.  Raises a `ZodError` with
 * a structured `issues` list on validation failure; callers translate the
 * error into an `AdapterError`.
 */
export function parseCredentialBundle(value: unknown): CredentialBundle {
  return credentialBundleSchema.parse(value);
}
