/**
 * Shared OAuth helpers — client_credentials flow with either client_secret or
 * client_assertion (JWT signed with a certificate private key).
 *
 * Used by every non-Graph adapter (Exchange, SharePoint, Teams, Compliance).
 * Each adapter calls into one of these helpers with a vendor-specific
 * resource scope and an attribution context for `AdapterError` reporting.
 *
 * The helper NEVER stores tokens — it returns the raw access_token string
 * which the caller keeps in a closure for the duration of the call.
 */

import { createPrivateKey, createSign, randomBytes } from "node:crypto";

import { AdapterError } from "./adapter-error.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

/**
 * Acquire an access token via the client_credentials flow with a client
 * secret.  Used by Exchange, Teams, Compliance.
 */
export async function acquireSecretToken(opts: {
  msTenantId: string;
  clientId: string;
  clientSecret: string;
  /** Resource scope, e.g. `"https://outlook.office365.com/.default"`. */
  scope: string;
  vendor: string;
  dataSource: string;
}): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${opts.msTenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      scope: opts.scope,
      grant_type: "client_credentials",
    }),
  });

  return readTokenResponse(response, opts.vendor, opts.dataSource);
}

/**
 * Acquire an access token via the client_credentials flow with a JWT
 * client_assertion signed by the supplied PEM private key.  Used by
 * SharePoint CSOM, which rejects client_secret tokens for app-only access.
 */
export async function acquireCertificateToken(opts: {
  msTenantId: string;
  clientId: string;
  /** Hex SHA-1 thumbprint of the certificate. */
  certThumbprint: string;
  /** PEM-encoded RSA private key (with or without certificate body). */
  certPem: string;
  /** Resource scope, e.g. `"https://contoso-admin.sharepoint.com/.default"`. */
  scope: string;
  vendor: string;
  dataSource: string;
}): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${opts.msTenantId}/oauth2/v2.0/token`;
  const assertion = buildClientAssertion({
    msTenantId: opts.msTenantId,
    clientId: opts.clientId,
    certThumbprint: opts.certThumbprint,
    certPem: opts.certPem,
    vendor: opts.vendor,
    dataSource: opts.dataSource,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_assertion: assertion,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      scope: opts.scope,
      grant_type: "client_credentials",
    }),
  });

  return readTokenResponse(response, opts.vendor, opts.dataSource);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function readTokenResponse(
  response: Response,
  vendor: string,
  dataSource: string,
): Promise<string> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AdapterError({
      message: `Failed to acquire access token (${response.status}).`,
      kind: "credentials_invalid",
      vendor,
      dataSource,
      vendorStatusCode: response.status,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
      cause: new Error(body.slice(0, 500)),
    });
  }

  const data = (await response.json().catch(() => null)) as
    | { access_token?: unknown; error?: unknown; error_description?: unknown }
    | null;

  if (!data || typeof data.access_token !== "string") {
    throw new AdapterError({
      message: "Token response missing access_token.",
      kind: "credentials_invalid",
      vendor,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
      cause:
        data && typeof data.error === "string"
          ? new Error(
              `${data.error}: ${
                typeof data.error_description === "string"
                  ? data.error_description
                  : ""
              }`,
            )
          : undefined,
    });
  }

  return data.access_token;
}

/**
 * Build the JWT client assertion required by certificate-based OAuth.
 *
 * The header `x5t` field is the URL-safe base64 of the SHA-1 thumbprint
 * (binary) — Microsoft's identity platform uses this to look up the
 * registered certificate.
 */
function buildClientAssertion(opts: {
  msTenantId: string;
  clientId: string;
  certThumbprint: string;
  certPem: string;
  vendor: string;
  dataSource: string;
}): string {
  let privateKey: ReturnType<typeof createPrivateKey>;
  try {
    privateKey = createPrivateKey(opts.certPem);
  } catch (cause) {
    throw new AdapterError({
      message: "Failed to load certificate private key.",
      kind: "credentials_invalid",
      vendor: opts.vendor,
      dataSource: opts.dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
      cause,
    });
  }

  const thumbprintBuf = Buffer.from(
    opts.certThumbprint.replace(/[^0-9a-f]/gi, ""),
    "hex",
  );

  const header = {
    alg: "RS256",
    typ: "JWT",
    x5t: base64UrlEncode(thumbprintBuf),
  };

  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    aud: `https://login.microsoftonline.com/${opts.msTenantId}/oauth2/v2.0/token`,
    iss: opts.clientId,
    sub: opts.clientId,
    jti: cryptoRandomId(),
    nbf: now,
    exp: now + 600, // 10 minutes
  };

  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = base64UrlEncode(signer.sign(privateKey));

  return `${signingInput}.${signature}`;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function cryptoRandomId(): string {
  // 128 bits of cryptographically-strong randomness, hex-encoded.
  return randomBytes(16).toString("hex");
}
