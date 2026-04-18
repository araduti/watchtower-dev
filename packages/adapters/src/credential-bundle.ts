import { createDecipheriv, type CipherGCMTypes } from "node:crypto";
import { z } from "zod";

import { AdapterError } from "./adapter-error.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

const AES_ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const AES_IV_LENGTH = 12;
const AES_TAG_LENGTH = 16;
const AES_KEY_LENGTH = 32;
const AES_MIN_BLOB_LENGTH = AES_IV_LENGTH + AES_TAG_LENGTH;

const VENDOR_NAME = "microsoft-graph" as const;

export const tenantCredentialBundleSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  msTenantId: z.string().min(1),
  sharepointCertPem: z.string().min(1).optional(),
  sharepointCertThumbprint: z.string().min(1).optional(),
  spoTenantName: z.string().min(1).optional(),
  complianceTenantName: z.string().min(1).optional(),
});

export type TenantCredentialBundle = z.infer<typeof tenantCredentialBundleSchema>;

export function decryptTenantCredentialBundle(
  encrypted: Buffer,
  dataSource: string,
): TenantCredentialBundle {
  const encryptionKey = process.env["WATCHTOWER_CREDENTIAL_KEY"];
  if (!encryptionKey) {
    throw new AdapterError({
      message: "WATCHTOWER_CREDENTIAL_KEY environment variable is not set.",
      kind: "permanent",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
    });
  }

  const keyBuffer = Buffer.from(encryptionKey, "hex");
  if (keyBuffer.length !== AES_KEY_LENGTH) {
    throw new AdapterError({
      message:
        `WATCHTOWER_CREDENTIAL_KEY must be exactly 64 hex characters (32 bytes), got ` +
        `${encryptionKey.length} hex characters (${keyBuffer.length} bytes).`,
      kind: "permanent",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
    });
  }

  if (encrypted.length < AES_MIN_BLOB_LENGTH) {
    throw new AdapterError({
      message: "Encrypted credentials blob is too small or empty.",
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
    });
  }

  try {
    const iv = Buffer.alloc(AES_IV_LENGTH);
    encrypted.copy(iv, 0, 0, AES_IV_LENGTH);

    const authTag = Buffer.alloc(AES_TAG_LENGTH);
    encrypted.copy(authTag, 0, AES_IV_LENGTH, AES_IV_LENGTH + AES_TAG_LENGTH);

    const ciphertext = Buffer.alloc(encrypted.length - AES_MIN_BLOB_LENGTH);
    encrypted.copy(ciphertext, 0, AES_MIN_BLOB_LENGTH);

    const decipher = createDecipheriv(AES_ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = tenantCredentialBundleSchema.parse(
      JSON.parse(plaintext.toString("utf-8")),
    );

    return parsed;
  } catch (cause) {
    throw new AdapterError({
      message: "Failed to decrypt tenant credentials.",
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
      cause,
    });
  }
}
