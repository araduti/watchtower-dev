/**
 * sharepoint-connector.ts
 *
 * Fetches SharePoint Online tenant settings via the CSOM ProcessQuery endpoint.
 * This is the same transport PnP.PowerShell uses internally for Get-PnPTenant.
 *
 * Endpoint: POST https://{tenant}-admin.sharepoint.com/_vti_bin/client.svc/ProcessQuery
 * Auth:     Client credentials token scoped to https://{tenant}-admin.sharepoint.com/.default
 *
 * Required app registration permissions:
 *   - SharePoint > Application > Sites.FullControl.All (for CSOM tenant admin access)
 *     OR at minimum AllSites.FullControl (delegated) — but for app-only use FullControl
 *
 * Required Entra role on service principal:
 *   - SharePoint Administrator (for Get-SPOTenant equivalent properties)
 *
 * Env vars required:
 *   AZURE_CLIENT_ID     — app registration client ID
 *   AZURE_CLIENT_SECRET — client secret
 *   AZURE_TENANT_ID     — tenant GUID
 *   SPO_TENANT_NAME     — SharePoint tenant name e.g. "contoso" (for contoso-admin.sharepoint.com)
 *                         Defaults to deriving from AZURE_TENANT_ID domain lookup
 *
 * ⚠️  ProcessQuery is an undocumented CSOM endpoint. It can change without notice.
 *     Captured via Proxyman while running Get-PnPTenant with PnP.PowerShell v3.1.
 */

import { readFileSync } from "fs";
import { createPrivateKey, createSign } from "crypto";

const CLIENT_ID   = process.env.AZURE_CLIENT_ID;
const TENANT_ID   = process.env.AZURE_TENANT_ID;
const SPO_TENANT  = process.env.SPO_TENANT_NAME; // e.g. "contoso"
const CERT_PATH   = process.env.SPO_CERT_PATH;   // path to watchtower.pem (private key + cert)
const CERT_THUMB  = process.env.SPO_CERT_THUMBPRINT; // hex thumbprint from generate-cert.sh

if (!CLIENT_ID)    throw new Error("AZURE_CLIENT_ID is not set");
if (!TENANT_ID)    throw new Error("AZURE_TENANT_ID is not set");
if (!SPO_TENANT)   throw new Error("SPO_TENANT_NAME is not set (e.g. 'contoso' for contoso-admin.sharepoint.com)");
if (!CERT_PATH)    throw new Error("SPO_CERT_PATH is not set (path to watchtower.pem)");
if (!CERT_THUMB)   throw new Error("SPO_CERT_THUMBPRINT is not set (from generate-cert.sh output)");

const ADMIN_URL = `https://${SPO_TENANT}-admin.sharepoint.com`;

// ─── Build JWT client assertion (certificate-based auth) ──────────────────────
// SharePoint CSOM requires certificate-based app-only tokens (client_secret not accepted)

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function thumbprintToBase64Url(hex: string): string {
  // Convert hex thumbprint (e.g. "A1B2C3...") to base64url-encoded SHA-1 bytes
  const clean = hex.replace(/:/g, "").replace(/ /g, "");
  const buf = Buffer.from(clean, "hex");
  return base64UrlEncode(buf);
}

function buildClientAssertion(): string {
  const now = Math.floor(Date.now() / 1000);
  const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const header = {
    alg: "RS256",
    typ: "JWT",
    x5t: thumbprintToBase64Url(CERT_THUMB!),
  };

  const payload = {
    aud: tokenEndpoint,
    iss: CLIENT_ID,
    sub: CLIENT_ID,
    jti: crypto.randomUUID(),
    nbf: now,
    exp: now + 600, // 10 minute validity
  };

  const pemContent = readFileSync(CERT_PATH!, "utf8");
  const privateKey = createPrivateKey(pemContent);

  const headerB64  = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sigInput   = `${headerB64}.${payloadB64}`;

  const sign = createSign("RSA-SHA256");
  sign.update(sigInput);
  const signature = base64UrlEncode(sign.sign(privateKey));

  return `${sigInput}.${signature}`;
}

// ─── Acquire token for SharePoint resource ────────────────────────────────────

const assertion = buildClientAssertion();

const tokenResponse = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:             CLIENT_ID!,
      client_assertion:      assertion,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      scope:                 `${ADMIN_URL}/.default`,
      grant_type:            "client_credentials",
    }),
  }
);

if (!tokenResponse.ok) {
  throw new Error(`Token acquisition failed: ${await tokenResponse.text()}`);
}

const tokenData = await tokenResponse.json() as any;
if (tokenData.error) throw new Error(`Token error: ${tokenData.error} — ${tokenData.error_description}`);

const TOKEN = tokenData.access_token;
console.log("[sharepoint-connector] Token acquired ✅");

// ─── CSOM ProcessQuery helper ─────────────────────────────────────────────────

// Tenant class TypeId — well-known, same across all tenants
const TENANT_TYPE_ID = "{268004ae-ef6b-4e9b-8425-127220d84719}";

// Captured from Proxyman trace of Get-PnPTenant:
// PnP sends a small request asking for HideDefaultThemes with SelectAllProperties="true"
// SharePoint returns the ENTIRE tenant object (~200 properties) in the response.
const CSOM_REQUEST = `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName=".NET Library" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009">
  <Actions>
    <ObjectPath Id="2" ObjectPathId="1"/>
    <Query Id="3" ObjectPathId="1">
      <Query SelectAllProperties="true">
        <Properties>
          <Property Name="HideDefaultThemes" ScalarProperty="true"/>
        </Properties>
      </Query>
    </Query>
  </Actions>
  <ObjectPaths>
    <Constructor Id="1" TypeId="${TENANT_TYPE_ID}"/>
  </ObjectPaths>
</Request>`;

async function fetchTenant(): Promise<Record<string, any>> {
  const res = await fetch(`${ADMIN_URL}/_vti_bin/client.svc/ProcessQuery`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type":  "text/xml",
      "User-Agent":    "NONISV|Ampliosoft|Watchtower/1.0.0",
    },
    body: CSOM_REQUEST,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ProcessQuery failed (${res.status}): ${body}`);
  }

  const json = await res.json() as any[];

  // Response is an array: [metadata, objectPathId, {IsNull}, objectPathId, {tenant object}]
  // Find the object with _ObjectType_ containing "Tenant"
  const tenantObj = json.find(
    (item: any) => item && typeof item === "object" && item._ObjectType_?.includes("Tenant")
  );

  if (!tenantObj) {
    throw new Error(`Tenant object not found in response. Raw: ${JSON.stringify(json).slice(0, 500)}`);
  }

  return tenantObj;
}

// ─── Normalize PascalCase keys to camelCase ───────────────────────────────────

function toCamel(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function normalizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([k]) => !k.startsWith("_")) // strip CSOM metadata keys
        .map(([k, v]) => [toCamel(k), normalizeKeys(v)])
    );
  }
  return obj;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const start = performance.now();

console.log("[sharepoint-connector] Fetching tenant settings via CSOM...");

const raw = await fetchTenant();
const normalized = normalizeKeys(raw);

// Also fetch sync client restriction (separate CSOM object)
// Get-SPOTenantSyncClientRestriction — TypeId {a6d5e1a1-2db5-4bca-a77a-4b7a23b8a7f1}
// TODO: add as second workload if needed for 7.3.2

const totalMs = ((performance.now() - start) / 1000).toFixed(2);
console.log(`[sharepoint-connector] Done in ${totalMs}s`);

// Output as array (consistent with exchange connector — Argus expects arrays for assert mode)
const snapshotData = {
  spoTenant: [normalized],
};

const outPath = process.env.SPO_OUT_PATH ?? "/tmp/watchtower-sharepoint.json";
await Bun.write(outPath, JSON.stringify(snapshotData, null, 2));
console.log(`[sharepoint-connector] Written → ${outPath}`);
