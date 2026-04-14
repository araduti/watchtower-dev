/**
 * compliance-connector.ts
 *
 * Collects data from Security & Compliance PowerShell cmdlets
 * via the Compliance Center REST API.
 *
 * Same pattern as exchange-connector.ts but different token audience:
 *   Exchange:   https://outlook.office365.com/.default
 *   Compliance: https://ps.compliance.protection.outlook.com/.default
 *
 * Same InvokeCommand endpoint pattern — cmdlets are proxied as JSON payloads.
 *
 * Env vars (shared with other connectors):
 *   AZURE_CLIENT_ID     — app registration client ID
 *   AZURE_CLIENT_SECRET — client secret
 *   AZURE_TENANT_ID     — tenant GUID
 *
 * Output: JSON written to COMPLIANCE_OUT_PATH (default: /tmp/watchtower-compliance.json)
 */

const CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const TENANT_ID     = process.env.AZURE_TENANT_ID;
// Compliance endpoint requires the .onmicrosoft.com name, not the GUID
// Build from SPO_TENANT_NAME (e.g. "ampliosoft" → "ampliosoft.onmicrosoft.com")
// or use COMPLIANCE_TENANT if explicitly set
const TENANT_NAME   = process.env.COMPLIANCE_TENANT
                   ?? (process.env.SPO_TENANT_NAME ? `${process.env.SPO_TENANT_NAME}.onmicrosoft.com` : null)
                   ?? TENANT_ID;
const TENANT        = TENANT_NAME;

if (!CLIENT_ID)     throw new Error("AZURE_CLIENT_ID is not set");
if (!CLIENT_SECRET) throw new Error("AZURE_CLIENT_SECRET is not set");
if (!TENANT_ID)     throw new Error("AZURE_TENANT_ID is not set");

// ─── Token acquisition ────────────────────────────────────────────────────────
// Compliance cmdlets require a token for the compliance protection endpoint,
// NOT the Exchange Online endpoint

const tokenResponse = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         "https://ps.compliance.protection.outlook.com/.default",
      grant_type:    "client_credentials",
    }),
  }
);

if (!tokenResponse.ok) {
  throw new Error(`Token acquisition failed: ${await tokenResponse.text()}`);
}

const tokenData = await tokenResponse.json() as any;
if (tokenData.error) throw new Error(`Token error: ${tokenData.error} — ${tokenData.error_description}`);

const TOKEN = tokenData.access_token;
console.log("[compliance-connector] Token acquired ✅");

// ─── Compliance API endpoint ──────────────────────────────────────────────────

// Compliance endpoint — same pattern as Exchange but different host + regional prefix
// The correct URL is: https://{region}.ps.compliance.protection.outlook.com/adminapi/beta/{tenant}/InvokeCommand
// We discover the region by first hitting the base URL which returns the regional endpoint
const BASE_URL = `https://ps.compliance.protection.outlook.com/adminapi/beta/${TENANT}/InvokeCommand`;

// Compliance endpoint requires X-AnchorMailbox just like Exchange
// Use the same system mailbox anchor pattern
const ANCHOR = `SystemMailbox{bb558c35-97f1-4cb9-8ff7-d53741dc928c}@${TENANT_NAME}`;

const headers = {
  "Authorization":    `Bearer ${TOKEN}`,
  "Content-Type":     "application/json",
  "X-ResponseFormat": "json",
  "X-AnchorMailbox":  ANCHOR,
  "Prefer":           "odata.maxpagesize=1000",
};

// ─── Normalize PascalCase keys to camelCase ───────────────────────────────────

function toCamel(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function normalizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), normalizeKeys(v)])
    );
  }
  return obj;
}

// ─── InvokeCommand helper ─────────────────────────────────────────────────────

async function invokeCommand(
  cmdlet: string,
  parameters: Record<string, any> = {}
): Promise<any[]> {
  const body = {
    CmdletInput: {
      CmdletName: cmdlet,
      Parameters: parameters,
    },
  };

  let allResults: any[] = [];
  let url: string | null = BASE_URL;

  while (url) {
    const response = await fetch(url, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${cmdlet} failed (${response.status}): ${errorText}`);
    }

    const json = await response.json() as any;
    const raw = json?.value ?? (Array.isArray(json) ? json : [json]);
    const value = raw.map(normalizeKeys);
    allResults = allResults.concat(value);

    url = json?.["@odata.nextLink"] ?? null;
  }

  return allResults;
}

// ─── Workloads ────────────────────────────────────────────────────────────────

interface Workload {
  key:    string;
  label:  string;
  cmdlet: string;
  params?: Record<string, any>;
}

const workloads: Workload[] = [
  // CIS 3.3.1 — sensitivity label policies are published
  {
    key:    "labelPolicies",
    label:  "Label Policies",
    cmdlet: "Get-LabelPolicy",
    params: {},
  },
  // Sensitivity labels catalog — used as proxy for 3.3.1
  {
    key:    "sensitivityLabels",
    label:  "Sensitivity Labels",
    cmdlet: "Get-Label",
    params: {},
  },
  // DLP policies — CIS 3.2.1, 3.2.2
  {
    key:    "dlpPolicies",
    label:  "DLP Policies",
    cmdlet: "Get-DlpCompliancePolicy",
    params: {},
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

const start = performance.now();
const snapshotData: Record<string, any> = {};
const findings: { key: string; error: string }[] = [];
const timings: { workload: string; "took (s)": string; items: number }[] = [];

console.log(`[compliance-connector] Running ${workloads.length} workloads in parallel...`);

const results = await Promise.allSettled(
  workloads.map(async (w) => {
    const t0 = performance.now();
    try {
      const raw = await invokeCommand(w.cmdlet, w.params ?? {});
      const took = ((performance.now() - t0) / 1000).toFixed(2);
      return { key: w.key, label: w.label, data: raw, took };
    } catch (err: any) {
      const took = ((performance.now() - t0) / 1000).toFixed(2);
      return { key: w.key, label: w.label, data: [], took, error: err.message };
    }
  })
);

for (const res of results) {
  if (res.status === "fulfilled") {
    const { key, label, data, took, error } = res.value as any;
    snapshotData[key] = data;
    timings.push({ workload: label, "took (s)": took, items: data.length });
    if (error) findings.push({ key, error });
  }
}

const totalMs = ((performance.now() - start) / 1000).toFixed(2);

console.log("\n  Per-workload wall times:");
console.table(timings.sort((a, b) => parseFloat(b["took (s)"]) - parseFloat(a["took (s)"])));

if (findings.length > 0) {
  console.log("\n  ❌ Errors:");
  console.table(findings);
}

const outPath = process.env.COMPLIANCE_OUT_PATH ?? "/tmp/watchtower-compliance.json";
await Bun.write(outPath, JSON.stringify(snapshotData, null, 2));
console.log(`\n[compliance-connector] Done in ${totalMs}s → ${outPath}`);
