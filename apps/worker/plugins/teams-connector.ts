/**
 * teams-connector.ts
 *
 * Fetches Teams client configuration via the Teams Tenant Admin API.
 * This is the same endpoint the MicrosoftTeams PowerShell module uses for Get-CsTeamsClientConfiguration.
 *
 * Endpoint: GET https://api.interfaces.records.teams.microsoft.com/Teams.TeamsConfigApi/TeamsClientConfiguration/Get
 * Auth:     Client credentials token scoped to 48ac35b8-9aa8-4d74-927d-1f4a14a0b239/.default
 *
 * Required app registration permissions:
 *   - Skype and Teams Tenant Admin API > Application > user_impersonation
 *     (Add via: API permissions → Add permission → APIs my org uses → search "Skype and Teams Tenant Admin API")
 *
 * Env vars required:
 *   AZURE_CLIENT_ID     — app registration client ID
 *   AZURE_CLIENT_SECRET — client secret
 *   AZURE_TENANT_ID     — tenant GUID
 *
 * ⚠️  api.interfaces.records.teams.microsoft.com is undocumented. It can change without notice.
 *     Captured via Proxyman while running Get-CsTeamsClientConfiguration with MicrosoftTeams PS module.
 */

const CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const TENANT_ID     = process.env.AZURE_TENANT_ID;

if (!CLIENT_ID)     throw new Error("AZURE_CLIENT_ID is not set");
if (!CLIENT_SECRET) throw new Error("AZURE_CLIENT_SECRET is not set");
if (!TENANT_ID)     throw new Error("AZURE_TENANT_ID is not set");

// ─── Acquire token for Teams resource ────────────────────────────────────────

const TEAMS_RESOURCE = "48ac35b8-9aa8-4d74-927d-1f4a14a0b239";

const tokenResponse = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         `${TEAMS_RESOURCE}/.default`,
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
console.log("[teams-connector] Token acquired ✅");

// ─── Fetch Teams endpoints ───────────────────────────────────────────────────

const BASE = "https://api.interfaces.records.teams.microsoft.com";

const WORKLOADS: { key: string; label: string; path: string; cmdlet: string }[] = [
  {
    key:    "teamsClientConfiguration",
    label:  "Teams Client Configuration",
    path:   "/Skype.Policy/configurations/TeamsClientConfiguration/configuration/Global",
    cmdlet: "Get-CsTeamsClientConfiguration",
  },
  {
    key:    "teamsExternalAccessPolicy",
    label:  "Teams External Access Policy",
    path:   "/Skype.Policy/configurations/ExternalAccessPolicy/configuration/Global",
    cmdlet: "Get-CsExternalAccessPolicy",
  },
  {
    key:    "teamsFederationConfiguration",
    label:  "Teams Federation Configuration",
    path:   "/Skype.Policy/configurations/TenantFederationSettings",
    cmdlet: "Get-CsTenantFederationConfiguration",
  },
  {
    key:    "teamsMeetingPolicy",
    label:  "Teams Meeting Policy",
    path:   "/Skype.Policy/configurations/TeamsMeetingPolicy/configuration/Global",
    cmdlet: "Get-CsTeamsMeetingPolicy",
  },
  {
    key:    "teamsMessagingPolicy",
    label:  "Teams Messaging Policy",
    path:   "/Skype.Policy/configurations/TeamsMessagingPolicy/configuration/Global",
    cmdlet: "Get-CsTeamsMessagingPolicy",
  },
];

async function fetchTeamsEndpoint(path: string, cmdlet: string): Promise<Record<string, any>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Authorization":   `Bearer ${TOKEN}`,
      "X-MS-CmdletName": cmdlet,
      "User-Agent":      "NONISV|Ampliosoft|Watchtower/1.0.0",
      "Accept-Encoding": "identity",
    },
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Teams API failed (${res.status}): ${body}`);

  try {
    return JSON.parse(body) as Record<string, any>;
  } catch {
    throw new Error(`Teams API returned non-JSON (${res.status}): ${body.slice(0, 500)}`);
  }
}

// ─── Normalize PascalCase keys to camelCase ───────────────────────────────────

function toCamel(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function normalizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), normalizeKeys(v)])
    );
  }
  return obj;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const start = performance.now();

console.log(`[teams-connector] Running ${WORKLOADS.length} workloads in parallel...`);

const results = await Promise.allSettled(
  WORKLOADS.map(async (w) => {
    const t0 = performance.now();
    const raw = await fetchTeamsEndpoint(w.path, w.cmdlet);
    // API may return array or object — normalize to always be an array of objects
    const normalized = normalizeKeys(raw);
    const data = Array.isArray(normalized) ? normalized : [normalized];
    const took = ((performance.now() - t0) / 1000).toFixed(2);
    return { key: w.key, label: w.label, data, took };
  })
);

const snapshotData: Record<string, any> = {};
const timings: { workload: string; "took (s)": string; items: number }[] = [];
const errors: { key: string; error: string }[] = [];

for (const res of results) {
  if (res.status === "fulfilled") {
    const { key, label, data, took } = res.value;
    snapshotData[key] = data;
    timings.push({ workload: label, "took (s)": took, items: data.length });
  } else {
    const err = res.reason?.message ?? String(res.reason);
    errors.push({ key: "unknown", error: err });
    console.error(`[teams-connector] ❌ ${err}`);
  }
}

const totalMs = ((performance.now() - start) / 1000).toFixed(2);
console.log("\n  Per-workload wall times:");
console.table(timings);
if (errors.length) { console.log("\n  ❌ Errors:"); console.table(errors); }

const outPath = process.env.TEAMS_OUT_PATH ?? "/tmp/watchtower-teams.json";
await Bun.write(outPath, JSON.stringify(snapshotData, null, 2));
console.log(`[teams-connector] Written → ${outPath}`);
