/**
 * Shared credential decryption — the SINGLE point where encrypted tenant
 * credentials are turned into plaintext.
 *
 * Every vendor adapter (Graph, Exchange, SharePoint, Teams, Compliance, …)
 * decrypts via {@link decryptCredentialBundle}.  No other code in the
 * repository decrypts credentials directly.
 *
 * Buffer layout (matches `credential-utils.encryptCredentials`):
 *   [12-byte IV][16-byte authTag][ciphertext...]
 *
 * @see docs/Code-Conventions.md §6 — Vendor adapter boundary
 * @see docs/decisions/003-vendor-adapter-boundary.md
 */

import {
  createDecipheriv,
  type CipherGCMTypes,
} from "node:crypto";

import { AdapterError } from "./adapter-error.ts";
import {
  parseCredentialBundle,
  type CredentialBundle,
} from "./credential-bundle.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

// AES-256-GCM constants — must match `credential-utils.ts` encrypt side.
const AES_ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const AES_IV_LENGTH = 12;
const AES_TAG_LENGTH = 16;
const AES_KEY_LENGTH = 32;
const AES_MIN_BLOB_LENGTH = AES_IV_LENGTH + AES_TAG_LENGTH;

/**
 * Decrypt an encrypted credential blob into a {@link CredentialBundle}.
 *
 * The plaintext is constructed inside this function and returned to the
 * immediate caller (an adapter), which keeps it in a local closure for the
 * duration of one collect() call.  No instance fields, no globals.
 *
 * @param encrypted - Sealed AES-256-GCM blob from `Tenant.encryptedCredentials`.
 * @param vendor    - Vendor name for AdapterError attribution.
 * @param dataSource- Data source name for AdapterError attribution.
 * @returns The decrypted, validated credential bundle.
 * @throws AdapterError(kind=credentials_invalid) on decryption or schema failure.
 */
export function decryptCredentialBundle(
  encrypted: Buffer,
  vendor: string,
  dataSource: string,
): CredentialBundle {
  try {
    const encryptionKey = process.env["WATCHTOWER_CREDENTIAL_KEY"];
    if (!encryptionKey) {
      throw new Error(
        "WATCHTOWER_CREDENTIAL_KEY environment variable is not set",
      );
    }

    const keyBuffer = Buffer.from(encryptionKey, "hex");
    if (keyBuffer.length !== AES_KEY_LENGTH) {
      throw new Error(
        `WATCHTOWER_CREDENTIAL_KEY must be exactly 64 hex characters ` +
          `(32 bytes), got ${encryptionKey.length} hex characters ` +
          `(${keyBuffer.length} bytes).`,
      );
    }

    if (encrypted.length < AES_MIN_BLOB_LENGTH) {
      throw new Error(
        `Encrypted credentials blob is too small: expected at least ` +
          `${AES_MIN_BLOB_LENGTH} bytes (IV + authTag), got ` +
          `${encrypted.length} bytes. The credentials may be corrupted ` +
          `or empty.`,
      );
    }

    // Use Buffer.alloc + copy to guarantee independent buffers with
    // byteOffset === 0.  Buffer.from(subarray) may still share the
    // underlying ArrayBuffer in Bun, causing BoringSSL to reject the
    // IV with ERR_CRYPTO_INVALID_IV.
    const iv = Buffer.alloc(AES_IV_LENGTH);
    encrypted.copy(iv, 0, 0, AES_IV_LENGTH);

    const authTag = Buffer.alloc(AES_TAG_LENGTH);
    encrypted.copy(authTag, 0, AES_IV_LENGTH, AES_IV_LENGTH + AES_TAG_LENGTH);

    const ciphertextLen =
      encrypted.length - AES_IV_LENGTH - AES_TAG_LENGTH;
    const ciphertext = Buffer.alloc(ciphertextLen);
    encrypted.copy(ciphertext, 0, AES_IV_LENGTH + AES_TAG_LENGTH);

    const decipher = createDecipheriv(AES_ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    const parsed = JSON.parse(plaintext.toString("utf-8")) as unknown;
    return parseCredentialBundle(parsed);
  } catch (cause) {
    throw new AdapterError({
      message: "Failed to decrypt tenant credentials.",
      kind: "credentials_invalid",
      vendor,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
      cause,
    });
  }
}
