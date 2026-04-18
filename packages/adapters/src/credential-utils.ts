/**
 * Credential encryption and verification utilities.
 *
 * Provides the encrypt side of the AES-256-GCM credential lifecycle.
 * The decrypt side lives in `graph-adapter.ts` and is NEVER exported
 * outside the adapter boundary (Code-Conventions §6).
 *
 * These utilities are used by the tRPC tenant router to:
 * 1. Encrypt client credentials before storing them in the database.
 * 2. Verify that credentials can acquire a Graph API token.
 *
 * @see docs/Code-Conventions.md §6
 */

import {
  createCipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

import { AdapterError } from "./adapter-error.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import {
  decryptTenantCredentialBundle,
  tenantCredentialBundleSchema,
  type TenantCredentialBundle,
} from "./credential-bundle.ts";

// ---------------------------------------------------------------------------
// Constants (must match graph-adapter.ts decryption constants)
// ---------------------------------------------------------------------------

const AES_ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const AES_IV_LENGTH = 12;
const AES_KEY_LENGTH = 32; // 256 bits
const VENDOR_NAME = "microsoft-graph" as const;

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

/**
 * Input shape for credential encryption.
 * These are the raw values from the user — they are encrypted immediately
 * and the plaintext is never stored or logged.
 */
export interface CredentialInput extends TenantCredentialBundle {}

/**
 * Encrypt Graph API credentials using AES-256-GCM.
 *
 * Buffer layout: [12-byte IV][16-byte authTag][ciphertext...]
 *
 * Uses `WATCHTOWER_CREDENTIAL_KEY` environment variable (64 hex chars = 32 bytes).
 *
 * @param credentials - The plaintext credentials to encrypt.
 * @returns Encrypted buffer ready for database storage.
 * @throws AdapterError if WATCHTOWER_CREDENTIAL_KEY is missing or invalid.
 */
export function encryptCredentials(credentials: CredentialInput): Buffer {
  const encryptionKey = process.env["WATCHTOWER_CREDENTIAL_KEY"];
  if (!encryptionKey) {
    throw new AdapterError({
      message: "WATCHTOWER_CREDENTIAL_KEY environment variable is not set.",
      kind: "permanent",
      vendor: VENDOR_NAME,
      dataSource: "credential-encryption",
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
    });
  }

  const keyBuffer = Buffer.from(encryptionKey, "hex");
  if (keyBuffer.length !== AES_KEY_LENGTH) {
    throw new AdapterError({
      message:
        `WATCHTOWER_CREDENTIAL_KEY must be exactly 64 hex characters (32 bytes), ` +
        `got ${encryptionKey.length} hex characters (${keyBuffer.length} bytes).`,
      kind: "permanent",
      vendor: VENDOR_NAME,
      dataSource: "credential-encryption",
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
    });
  }

  const plaintext = JSON.stringify(tenantCredentialBundleSchema.parse(credentials));

  const iv = randomBytes(AES_IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, keyBuffer, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Buffer layout: [12-byte IV][16-byte authTag][ciphertext...]
  return Buffer.concat([iv, authTag, encrypted]);
}

// ---------------------------------------------------------------------------
// Credential verification (lightweight token probe)
// ---------------------------------------------------------------------------

/**
 * Verify that credentials can acquire a Microsoft Graph API access token.
 *
 * This performs the client_credentials OAuth flow without making any
 * Graph API data calls. Used as a health check after credential setup.
 *
 * @param credentials - The plaintext credentials to verify.
 * @returns `true` if a token was acquired successfully.
 * @throws AdapterError with CREDENTIAL_VERIFICATION_FAILED on failure.
 */
export async function verifyCredentials(
  credentials: CredentialInput,
): Promise<true> {
  const tokenUrl = `https://login.microsoftonline.com/${credentials.msTenantId}/oauth2/v2.0/token`;

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
  } catch (cause) {
    throw new AdapterError({
      message: "Network error while verifying credentials.",
      kind: "transient",
      vendor: VENDOR_NAME,
      dataSource: "credential-verification",
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIAL_VERIFICATION_FAILED,
      cause,
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AdapterError({
      message: `Credential verification failed: token endpoint returned ${response.status}.`,
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource: "credential-verification",
      vendorStatusCode: response.status,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIAL_VERIFICATION_FAILED,
      cause: new Error(body),
    });
  }

  const tokenResponse: unknown = await response.json();

  if (
    typeof tokenResponse !== "object" ||
    tokenResponse === null ||
    !("access_token" in tokenResponse) ||
    typeof (tokenResponse as Record<string, unknown>)["access_token"] !== "string"
  ) {
    throw new AdapterError({
      message: "Token response missing access_token during verification.",
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource: "credential-verification",
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIAL_VERIFICATION_FAILED,
    });
  }

  return true;
}

// ---------------------------------------------------------------------------
// Encrypted credential verification
// ---------------------------------------------------------------------------

/**
 * Decrypt an encrypted credentials blob and verify it can acquire a token.
 *
 * This keeps decryption inside the adapter boundary (Code-Conventions §6).
 * The plaintext credentials live in-memory only for the duration of this
 * call and are never returned to the caller.
 *
 * @param encrypted - The AES-256-GCM sealed blob from the database.
 * @returns `true` if a token was acquired successfully.
 * @throws AdapterError with CREDENTIAL_VERIFICATION_FAILED on any failure.
 */
export async function verifyEncryptedCredentials(
  encrypted: Buffer,
): Promise<true> {
  const decryptedCredentials = decryptTenantCredentialBundle(
    encrypted,
    "credential-verification",
  );

  return verifyCredentials(decryptedCredentials);
}
