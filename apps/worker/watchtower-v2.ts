/**
 * watchtower-v2.ts
 *
 * Data-first rewrite of argus.ingest.ts.
 *
 * Key differences from argus.ingest.ts:
 *   1. $select fields are driven by a selectMap (simulating future DB-driven approach)
 *   2. Output is evidence.json — one entry per source with raw value + timing
 *   3. No framework awareness — pure collection
 *   4. Same parallelism and connector architecture as v1
 *
 * Output shape (evidence.json):
 * {
 *   "collectedAt": "ISO string",
 *   "durationMs":  1234,
 *   "sources": {
 *     "domains": {
 *       "rawValue":    [...],   // complete objects, no field filtering beyond selectMap
 *       "collectedAt": "ISO",
 *       "durationMs":  230,
 *       "status":      "ok" | "failed",
 *       "error":       null | "message"
 *     }
 *   }
 * }
 *
 * Run alongside argus.ingest.ts to compare speed and completeness.
 */


import { Client } from "@microsoft/microsoft-graph-client";

/**
 * Default Accept-Language header for Graph API requests.
 * Bun may omit or default to "*", causing CultureNotFoundException server-side.
 */
const GRAPH_ACCEPT_LANGUAGE = "en-US";

// ─── Select map ───────────────────────────────────────────────────────────────
//
// getSelectMap() simulates what will eventually be:
//
//   SELECT source, array_agg(DISTINCT property) || ARRAY['id'] as fields
//   FROM ControlAssertion
//   GROUP BY source
//
// When the DB exists, replace this function body with:
//
//   const rows = await db.controlAssertion.groupBy({
//     by: ["source"],
//     _agg: { property: { _all: true } },
//   });
//   return Object.fromEntries(rows.map(r => [r.source, [...new Set(["id", ...r.properties])]]));
//
// The rest of watchtower-v2.ts is unchanged — this is the only DB touch point
// for field selection.

async function getSelectMap(): Promise<Record<string, string[]>> {
  // TODO: replace with real DB query when ControlAssertion table exists
  // Mocked from union of all 117 CIS spec properties + anticipated framework needs
  return MOCKED_SELECT_MAP;
}

// ── Mocked select map (source of truth until DB exists) ──────────────────────
// Properties are the union of:
//   - All properties referenced in current CIS 3.0 spec files
//   - Properties anticipated for ScubaGear, NIS2, DORA mappings
//   - "id" always included for identity

const MOCKED_SELECT_MAP: Record<string, string[]> = {
  domains: [
    "id", "isDefault", "isVerified", "isInitial", "isAdminManaged",
    "passwordValidityPeriodInDays", "passwordNotificationWindowInDays",
    "supportedServices", "state", "authenticationType",
  ],
  groups: [
    "id", "displayName", "description", "visibility", "groupTypes",
    "membershipRule", "membershipRuleProcessingState", "securityEnabled",
    "mailEnabled", "assignedLicenses", "createdDateTime", "renewedDateTime",
    "expirationDateTime", "mail", "proxyAddresses",
  ],
  privilegedUsers: [
    "id", "displayName", "userPrincipalName", "onPremisesSyncEnabled",
    "assignedLicenses", "accountEnabled", "userType", "createdDateTime",
    "lastPasswordChangeDateTime", "passwordPolicies",
    "onPremisesImmutableId", "onPremisesLastSyncDateTime",
  ],
  userRegistrationDetails: [
    "userPrincipalName", "isMfaCapable", "isMfaRegistered",
    "isAdmin", "userType", "isSsprCapable", "isSsprRegistered",
    "isSsprEnabled", "isPasswordlessCapable", "methodsRegistered",
  ],
  managedDevices: [
    "id", "deviceName", "operatingSystem",
    "complianceState", "managementAgent", "enrolledDateTime",
    "lastSyncDateTime", "isEncrypted", "isSupervised", "jailBroken",
    "azureADDeviceId", "userDisplayName", "userPrincipalName",
  ],
  pimEligibleAssignments: [
    "id", "principalId", "roleDefinitionId", "directoryScopeId",
    "startDateTime", "endDateTime", "memberType",
  ],
  roleManagementPolicyAssignments: [
    "id", "policyId", "roleDefinitionId", "scopeId", "scopeType",
  ],
  thirdPartyStorage: [
    "id", "appId", "displayName", "accountEnabled", "servicePrincipalType",
  ],
};

// ─── Timer ────────────────────────────────────────────────────────────────────

const timer = {
  start: performance.now(),
  last:  performance.now(),
  splits: [] as { label: string; elapsed: number; delta: number }[],
  log(msg: string) {
    const elapsed = (performance.now() - timer.start) / 1000;
    const delta   = elapsed - (timer.last - timer.start) / 1000;
    timer.last    = performance.now();
    timer.splits.push({ label: msg, elapsed, delta });
    console.log(`\x1b[33m[${elapsed.toFixed(2)}s +${delta.toFixed(2)}s]\x1b[0m ${msg}`);
  },
  summary() {
    const sorted = [...timer.splits].sort((a, b) => b.delta - a.delta);
    console.log("\n--- TIMING BREAKDOWN ---");
    console.table(sorted.map(s => ({
      step:          s.label,
      "elapsed (s)": s.elapsed.toFixed(2),
      "took (s)":    s.delta.toFixed(2),
    })));
  },
};

// ─── Source registry ──────────────────────────────────────────────────────────
//
// All Graph workloads in one place.
// path: the Graph API path — $select injected dynamically from SELECT_MAP
// beta: use /beta endpoint
// noTop: singleton response (not an array)

const GRAPH_SOURCES: Record<string, {
  path:   string;
  beta:   boolean;
  noTop?: boolean;
  label:  string;
}> = {
  caPolicies:              { path: "/identity/conditionalAccess/policies",                                                               beta: false, label: "Conditional Access" },
  deviceConfigs:           { path: "/deviceManagement/deviceConfigurations?$expand=assignments",                                         beta: false, label: "Intune Configs" },
  managedDevices:          { path: "/deviceManagement/managedDevices",                                                                   beta: false, label: "Device Inventory" },
  groups:                  { path: "/groups",                                                                                            beta: false, label: "Groups" },
  domains:                 { path: "/domains",                                                                                           beta: false, label: "Domains" },
  timeoutPolicies:         { path: "/policies/activityBasedTimeoutPolicies",                                                             beta: false, label: "Timeout Policies" },
  appsAndServices:         { path: "/admin/appsAndServices/settings",                                                                    beta: true,  label: "Apps and Services",           noTop: true },
  formsSettings:           { path: "/admin/forms/settings",                                                                              beta: true,  label: "Forms Settings",              noTop: true },
  deviceManagementSettings:{ path: "/deviceManagement/settings",                                                                         beta: false, label: "Device Management Settings",  noTop: true },
  enrollmentConfigurations:{ path: "/deviceManagement/deviceEnrollmentConfigurations",                                                   beta: true,  label: "Enrollment Configurations" },
  authorizationPolicy:     { path: "/policies/authorizationPolicy",                                                                      beta: false, label: "Authorization Policy",        noTop: true },
  threatSubmissionPolicy:  { path: "/security/threatSubmission/emailThreatSubmissionPolicies",                                           beta: true,  label: "Threat Submission Policy" },
  sharepointSettings:      { path: "/admin/sharepoint/settings",                                                                         beta: false, label: "SharePoint Settings",         noTop: true },
  deviceRegistrationPolicy:{ path: "/policies/deviceRegistrationPolicy",                                                                 beta: true,  label: "Device Registration Policy",  noTop: true },
  adminConsentRequestPolicy:{ path: "/policies/adminConsentRequestPolicy",                                                               beta: false, label: "Admin Consent Request Policy",noTop: true },
  b2bManagementPolicy:     { path: "/legacy/policies",                                                                                   beta: true,  label: "B2B Management Policy" },
  authMethodsPolicy:       { path: "/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/MicrosoftAuthenticator",    beta: false, label: "Auth Methods Policy",         noTop: true },
  passwordProtectionSettings: { path: "/groupSettings",                                                                                  beta: false, label: "Password Protection Settings" },
  userRegistrationDetails: { path: "/reports/authenticationMethods/userRegistrationDetails",                                            beta: false, label: "User Registration Details" },
  authMethodConfigurations:{ path: "/policies/authenticationMethodsPolicy",                                                              beta: true,  label: "Auth Method Configurations",  noTop: true },
  pimEligibleAssignments:  { path: "/roleManagement/directory/roleEligibilityScheduleInstances",                                         beta: false, label: "PIM Eligible Assignments" },
  accessReviews:           { path: "/identityGovernance/accessReviews/definitions?$top=100",                                             beta: false, label: "Access Reviews" },
  roleManagementPolicyAssignments: { path: "/policies/roleManagementPolicyAssignments?$filter=scopeId eq '/' and scopeType eq 'DirectoryRole'", beta: true, label: "Role Management Policy Assignments" },
  thirdPartyStorage:       { path: "/servicePrincipals(appId='c1f33bc0-bdb4-4248-ba9b-096807ddb43e')",                                  beta: false, label: "Third Party Storage SP",      noTop: true },
  compliancePolicies:      { path: "/deviceManagement/deviceCompliancePolicies?$expand=assignments",                                    beta: false, label: "Compliance Policies" },
  endpointSecurity:        { path: "/deviceManagement/configurationPolicies?$expand=assignments",                                        beta: true,  label: "Endpoint Security" },

  // Purview / Information Protection — requires InformationProtectionPolicy.Read.All
  // $filter=isScopedToUser eq false returns org-wide labels for service principal context
  // sensitivityLabels: requires E5 licensing — not collected
  // See permissions-inventory.md for details
};

// ─── Path builder — injects $select from selectMap ──────────────────────────

function buildPath(key: string, basePath: string, selectMap: Record<string, string[]>): string {
  // If selectMap has explicit fields for this source, use them
  // Otherwise remove any existing $select to get full objects
  const fields = selectMap[key];

  if (fields && fields.length > 0) {
    // Don't add $select if path already has a $select (e.g. hardcoded in path)
    if (basePath.includes("$select")) return basePath;
    const separator = basePath.includes("?") ? "&" : "?";
    return `${basePath}${separator}$select=${fields.join(",")}`;
  }

  // No selectMap entry — strip any existing $select to collect full objects
  // This is the "collect everything" mode for sources not yet mapped to controls
  return basePath.replace(/[?&]\$select=[^&]*/g, "").replace(/\?$/, "").replace(/&$/, "");
}

// ─── Graph fetch helpers ──────────────────────────────────────────────────────

/**
 * graphFetch — wrapper around the Graph SDK's .get() with retry-after / backoff.
 * Per Code-Conventions.md §6: retries live inside the adapter with exponential
 * backoff, jitter, and respect for Retry-After.
 */
const GRAPH_MAX_RETRIES = 3;   // up to 4 total attempts
const GRAPH_BASE_DELAY  = 1000; // 1 s
const GRAPH_MAX_DELAY   = 30_000; // 30 s

async function graphFetch(request: { get: () => Promise<any> }): Promise<any> {
  for (let attempt = 0; attempt <= GRAPH_MAX_RETRIES; attempt++) {
    try {
      return await request.get();
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.code;
      if (statusCode !== 429 || attempt === GRAPH_MAX_RETRIES) {
        throw err;
      }

      // Respect Retry-After header if available (seconds)
      const retryAfterHeader = err?.headers?.get?.("Retry-After")
        ?? err?.headers?.["retry-after"]
        ?? err?.headers?.["Retry-After"];
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : undefined;

      // Exponential backoff with jitter, capped at GRAPH_MAX_DELAY
      const backoffMs = Math.min(
        GRAPH_BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000,
        GRAPH_MAX_DELAY,
      );
      const waitMs = retryAfterMs ?? backoffMs;

      console.warn(
        `graphFetch: 429 throttled — retrying in ${(waitMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${GRAPH_MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  // unreachable, but satisfies TS
  throw new Error("graphFetch: exhausted retries");
}

async function graphGet(client: Client, path: string, beta: boolean): Promise<any> {
  return graphFetch(client.api(path).version(beta ? "beta" : "v1.0"));
}

async function fetchAll(client: Client, path: string, beta: boolean, noTop: boolean): Promise<any[]> {
  if (noTop) {
    const res = await graphGet(client, path, beta);
    return [res]; // singleton
  }

  const items: any[] = [];
  let   nextLink: string | undefined = path;

  while (nextLink) {
    const res = await graphFetch(client.api(nextLink).version(beta ? "beta" : "v1.0"));
    items.push(...(res.value ?? []));
    nextLink = res["@odata.nextLink"];
  }

  return items;
}

async function fetchBatch(
  client: Client,
  ids: string[],
  urlBuilder: (id: string) => string,
): Promise<{ results: Record<string, any>; errors: string[] }> {
  const results: Record<string, any> = {};
  const errors: string[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const requests = chunk.map((id, idx) => ({
      id:     String(idx),
      method: "GET",
      url:    urlBuilder(id),
    }));

    try {
      const res = await client.api("/$batch").version("v1.0").post({ requests });
      for (const r of res.responses ?? []) {
        const id = chunk[parseInt(r.id)];
        if (r.status === 200 && id !== undefined) results[id] = r.body;
        else if (r.status !== 404) {
          const errMsg = `Batch sub-request ${id} failed (${r.status}): ${r.body?.error?.message ?? "unknown"}`;
          console.warn(errMsg);
          errors.push(errMsg);
        }
        // 404s are expected for service principals / managed identities — silently skip
      }
    } catch (err: any) {
      const errMsg = `Batch request failed: ${err.message}`;
      console.error(errMsg);
      errors.push(errMsg);
    }
  }

  return { results, errors };
}

// ─── Source collector ─────────────────────────────────────────────────────────

interface SourceResult {
  rawValue:    any[];
  collectedAt: string;
  durationMs:  number;
  status:      "ok" | "failed";
  error:       string | null;
}

async function collectSource(
  client:     Client,
  key:        string,
  config:     typeof GRAPH_SOURCES[string],
  selectMap:  Record<string, string[]>,
): Promise<SourceResult> {
  const t0   = performance.now();
  const path = buildPath(key, config.path, selectMap);

  try {
    const data = await fetchAll(client, path, config.beta, config.noTop ?? false);
    return {
      rawValue:    data,
      collectedAt: new Date().toISOString(),
      durationMs:  Math.round(performance.now() - t0),
      status:      "ok",
      error:       null,
    };
  } catch (err: any) {
    return {
      rawValue:    [],
      collectedAt: new Date().toISOString(),
      durationMs:  Math.round(performance.now() - t0),
      status:      "failed",
      error:       err.message ?? String(err),
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const TENANT_ID     = process.env.AZURE_TENANT_ID;

if (!CLIENT_ID)     throw new Error("AZURE_CLIENT_ID is not set");
if (!CLIENT_SECRET) throw new Error("AZURE_CLIENT_SECRET is not set");
if (!TENANT_ID)     throw new Error("AZURE_TENANT_ID is not set");

// Fetch Graph token via client_credentials — same pattern as all connectors
async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        scope:         "https://graph.microsoft.com/.default",
        grant_type:    "client_credentials",
      }),
    }
  );
  const data = await res.json() as any;
  if (!data.access_token) throw new Error(`Graph token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

timer.log("Graph client initialized");

const graphToken = await getGraphToken();
const client = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => graphToken,
  },
  fetchOptions: {
    headers: { "Accept-Language": GRAPH_ACCEPT_LANGUAGE },
  },
});

// ── Fetch select map from DB (mocked) ────────────────────────────────────────
const selectMap = await getSelectMap();
timer.log(`Select map loaded (${Object.keys(selectMap).length} sources, ${Object.values(selectMap).reduce((n, f) => n + f.length, 0)} total fields)`);

const sources: Record<string, SourceResult> = {};
const timings: { source: string; label: string; "took (s)": string; items: number; status: string }[] = [];

// ── Spawn connectors immediately — run in parallel with all Graph phases ──────

const dnsOutPath        = "/tmp/watchtower-v2-dns.json";
const exoOutPath        = "/tmp/watchtower-v2-exchange.json";
const spoOutPath        = "/tmp/watchtower-v2-sharepoint.json";
const teamsOutPath      = "/tmp/watchtower-v2-teams.json";
const complianceOutPath = "/tmp/watchtower-v2-compliance.json";

// DNS needs verified domains — spawn with placeholder, it will wait for input
// Exchange, SharePoint, Teams, Compliance have no Graph dependency — spawn immediately
const exoProcess        = Bun.spawn(["bun", "run", "apps/worker/plugins/exchange-connector.ts"],   { stdout: "inherit", stderr: "inherit", env: { ...process.env, EXO_OUT_PATH: exoOutPath } });
const spoProcess        = process.env.SPO_TENANT_NAME ? Bun.spawn(["bun", "run", "apps/worker/plugins/sharepoint-connector.ts"], { stdout: "inherit", stderr: "inherit", env: { ...process.env, SPO_OUT_PATH: spoOutPath } }) : null;
const teamsProcess      = Bun.spawn(["bun", "run", "apps/worker/plugins/teams-connector.ts"],     { stdout: "inherit", stderr: "inherit", env: { ...process.env, TEAMS_OUT_PATH: teamsOutPath } });
const complianceProcess = Bun.spawn(["bun", "run", "apps/worker/plugins/compliance-connector.ts"], { stdout: "inherit", stderr: "inherit", env: { ...process.env, COMPLIANCE_OUT_PATH: complianceOutPath } });
timer.log("Exchange, SharePoint, Teams, Compliance connectors spawned");

timer.log("Phase 1: collecting all sources in parallel");

// Run all Graph sources in parallel — same strategy as v1
const sourceEntries = Object.entries(GRAPH_SOURCES);

const allResults = await Promise.allSettled(
  sourceEntries.map(async ([key, config]) => {
    const result = await collectSource(client, key, config, selectMap);
    return { key, label: config.label, result };
  })
);

for (const res of allResults) {
  if (res.status === "fulfilled") {
    const { key, label, result } = res.value;
    sources[key] = result;
    timings.push({
      source:     key,
      label,
      "took (s)": (result.durationMs / 1000).toFixed(2),
      items:      result.rawValue.length,
      status:     result.status,
    });
  } else {
    console.error("Phase 1: source collection rejected unexpectedly:", res.reason);
  }
}

timer.log(`Phase 1: complete — ${sourceEntries.length} sources`);

// ── Phase helper functions ────────────────────────────────────────────────────
// Phases 2, 3, 4 are extracted into async functions so they can run in parallel
// after Phase 1 completes.

// ── Endpoint security settings (Phase 2) ─────────────────────────────────────
async function collectEndpointSettings(): Promise<void> {
  const endpointPolicies: any[] = sources.endpointSecurity?.rawValue ?? [];
  const policiesNeedingSettings = endpointPolicies.filter((p: any) => (p.settingCount ?? 0) > 0);

  if (policiesNeedingSettings.length === 0) return;

  timer.log(`Phase 2: fetching settings for ${policiesNeedingSettings.length} endpoint policies`);
  const t0 = performance.now();

  const settingResults = await Promise.allSettled(
    policiesNeedingSettings.map(async (policy: any) => {
      try {
        const data = await fetchAll(
          client,
          `/deviceManagement/configurationPolicies/${policy.id}/settings`,
          true,
          false
        );
        return { id: policy.id, settings: data };
      } catch (err: any) {
        return { id: policy.id, settings: [], error: err?.message ?? String(err) };
      }
    })
  );

  const settingsById: Record<string, any[]> = {};
  for (const res of settingResults) {
    if (res.status === "fulfilled") {
      if (res.value.error) {
        console.warn(`Phase 2: settings for policy ${res.value.id} failed: ${res.value.error}`);
      }
      settingsById[res.value.id] = res.value.settings;
    } else {
      console.error("Phase 2: settings fetch rejected unexpectedly:", res.reason);
    }
  }

  // Attach settings to policies — immutable update (don't mutate rawValue)
  if (sources.endpointSecurity) {
    sources.endpointSecurity = {
      ...sources.endpointSecurity,
      rawValue: sources.endpointSecurity.rawValue.map((policy: any) => ({
        ...policy,
        settings: settingsById[policy.id] ?? [],
      })),
    };
  }

  const totalSettings = Object.values(settingsById).reduce((n, s) => n + s.length, 0);
  timer.log(`Phase 2: complete — ${totalSettings} settings in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
}

// ── Privileged users (Phase 3) ────────────────────────────────────────────────
async function collectPrivilegedUsers(): Promise<void> {
  timer.log("Phase 3: privileged users");
  const t0 = performance.now();

  try {
    const assignments = await fetchAll(
      client,
      "/roleManagement/directory/roleAssignments?$select=principalId,roleDefinitionId",
      false,
      false
    );

    const principalIds = [...new Set(assignments.map((a: any) => a.principalId as string))];
    timer.log(`Phase 3: resolving ${principalIds.length} principals`);

    // Resolve principal types first via /directoryObjects/{id}
    // @odata.type tells us user vs service principal vs group — no blind /users calls
    const { results: directoryObjects } = await fetchBatch(
      client,
      principalIds,
      (id) => `/directoryObjects/${id}`
    );

    const userIds = Object.entries(directoryObjects)
      .filter(([, obj]: [string, any]) => obj?.["@odata.type"] === "#microsoft.graph.user")
      .map(([id]) => id);

    timer.log(`Phase 3: ${userIds.length} users out of ${principalIds.length} principals`);

    const userFields = "id,displayName,userPrincipalName,onPremisesSyncEnabled,assignedLicenses";
    const { results: userDetails } = userIds.length > 0
      ? await fetchBatch(client, userIds, (id) => `/users/${id}?$select=${userFields}`)
      : { results: {} as Record<string, any> };

    const durationMs = Math.round(performance.now() - t0);
    sources.privilegedUsers = {
      rawValue: assignments
        .filter((a: any) => userIds.includes(a.principalId))
        .map((a: any) => ({
          principalId:    a.principalId,
          roleTemplateId: a.roleDefinitionId,
          principal:      userDetails[a.principalId] ?? null,
        }))
        .filter((a: any) => a.principal?.userPrincipalName),
      collectedAt: new Date().toISOString(),
      durationMs,
      status:      "ok",
      error:       null,
    };

    timings.push({ source: "privilegedUsers", label: "Privileged Users", "took (s)": (durationMs / 1000).toFixed(2), items: sources.privilegedUsers.rawValue.length, status: "ok" });
    timer.log(`Phase 3: ${sources.privilegedUsers.rawValue.length} privileged users`);
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);
    sources.privilegedUsers = { rawValue: [], collectedAt: new Date().toISOString(), durationMs, status: "failed", error: err.message };
    timings.push({ source: "privilegedUsers", label: "Privileged Users", "took (s)": (durationMs / 1000).toFixed(2), items: 0, status: "failed" });
    timer.log("Phase 3: failed");
  }
}

// ── PRA rules (Phase 4) ───────────────────────────────────────────────────────
async function collectPraRules(): Promise<void> {
  const t0 = performance.now();

  try {
    const PRA_TEMPLATE_ID = "e8611ab8-c189-46e8-94e1-60213ab1f814";
    const assignments: any[] = sources.roleManagementPolicyAssignments?.rawValue ?? [];
    const praAssignment = assignments.find((a: any) => a.roleDefinitionId === PRA_TEMPLATE_ID);

    if (praAssignment?.policyId) {
      const rules = await fetchAll(
        client,
        `/policies/roleManagementPolicies/${praAssignment.policyId}/rules`,
        true,
        false
      );
      const durationMs = Math.round(performance.now() - t0);
      sources.praRoleManagementPolicyRules = {
        rawValue:    rules,
        collectedAt: new Date().toISOString(),
        durationMs,
        status:      "ok",
        error:       null,
      };
      timings.push({ source: "praRoleManagementPolicyRules", label: "PRA Rules", "took (s)": (durationMs / 1000).toFixed(2), items: rules.length, status: "ok" });
      timer.log(`Phase 4: PRA rules (${rules.length} rules)`);
    }
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);
    sources.praRoleManagementPolicyRules = { rawValue: [], collectedAt: new Date().toISOString(), durationMs, status: "failed", error: err?.message ?? "PRA rules failed" };
    timings.push({ source: "praRoleManagementPolicyRules", label: "PRA Rules", "took (s)": (durationMs / 1000).toFixed(2), items: 0, status: "failed" });
  }
}

// ── Spawn DNS connector now that domains are available ────────────────────────

const verifiedDomains = (sources.domains?.rawValue ?? [])
  .filter((d: any) => d.isVerified)
  .map((d: any) => d.id);

const dnsProcess = Bun.spawn(
  ["bun", "run", "apps/worker/plugins/dns-connector.ts", JSON.stringify(verifiedDomains), dnsOutPath],
  { stdout: "inherit", stderr: "inherit", env: { ...process.env } }
);

timer.log(`DNS connector spawned for ${verifiedDomains.length} domains`);

// ── Run Phases 2, 3, 4 in parallel ───────────────────────────────────────────
// All three depend only on Phase 1 results — no inter-phase dependencies.

await Promise.all([
  collectEndpointSettings(),   // Phase 2 — depends on sources.endpointSecurity
  collectPrivilegedUsers(),    // Phase 3 — fresh roleAssignment fetch
  collectPraRules(),           // Phase 4 — depends on sources.roleManagementPolicyAssignments
]);

// ── Await all connectors ──────────────────────────────────────────────────────

const exitCodes = {
  dns:        await dnsProcess.exited,
  exchange:   await exoProcess.exited,
  sharepoint: spoProcess ? await spoProcess.exited : 0,
  teams:      await teamsProcess.exited,
  compliance: await complianceProcess.exited,
};

// Record failed connectors before attempting file merge
for (const [name, code] of Object.entries(exitCodes)) {
  if (code !== 0) {
    console.error(`Connector "${name}" exited with code ${code}`);
    sources[name] = {
      rawValue:    [],
      collectedAt: new Date().toISOString(),
      durationMs:  0,
      status:      "failed",
      error:       `Connector process exited with code ${code}`,
    };
  }
}

// Merge connector outputs
const connectorMerges: [string, string, "array" | "dict"][] = [
  ["domainDnsRecords", dnsOutPath,           "array"],  // DNS returns array of domain objects
  ["_exchange",        exoOutPath,           "dict"],   // Exchange returns { key: data[] }
  ["_sharepoint",      spoOutPath,           "dict"],   // SharePoint returns { key: data[] }
  ["_teams",           teamsOutPath,         "dict"],   // Teams returns { key: data[] }
  ["_compliance",      complianceOutPath,    "dict"],   // Compliance returns { key: data[] }
];

for (const [key, path, format] of connectorMerges) {
  try {
    const data = JSON.parse(await Bun.file(path).text());
    if (format === "array") {
      // DNS — store entire array under the key name
      sources[key] = {
        rawValue:    data,
        collectedAt: new Date().toISOString(),
        durationMs:  0,
        status:      "ok",
        error:       null,
      };
    } else {
      // Exchange/SPO/Teams/Compliance — each top-level key becomes its own source
      for (const [sourceKey, value] of Object.entries(data as Record<string, any>)) {
        sources[sourceKey] = {
          rawValue:    Array.isArray(value) ? value : [value],
          collectedAt: new Date().toISOString(),
          durationMs:  0,
          status:      "ok",
          error:       null,
        };
      }
    }
    timer.log(`${key.replace(/^_/, "")} merged`);
  } catch (err: any) {
    const sourceKey = key.replace(/^_/, "");
    sources[sourceKey] = {
      rawValue:    [],
      collectedAt: new Date().toISOString(),
      durationMs:  0,
      status:      "failed",
      error:       `Connector output failed: ${err?.message ?? String(err)}`,
    };
    timer.log(`${sourceKey} — failed: ${err?.message ?? String(err)}`);
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

console.log("\n  Per-source wall times:");
console.table(
  timings
    .sort((a, b) => parseFloat(b["took (s)"]) - parseFloat(a["took (s)"]))
    .map(t => ({ source: t.label, "took (s)": t["took (s)"], items: t.items, status: t.status }))
);

const output = {
  collectedAt: new Date().toISOString(),
  durationMs:  Math.round(performance.now() - timer.start),
  sourceCount: Object.keys(sources).length,
  sources,
};

const outPath = process.env.EVIDENCE_OUT_PATH ?? "evidence.json";
await Bun.write(outPath, JSON.stringify(output, null, 2));

const sizeKb = (JSON.stringify(output).length / 1024).toFixed(1);
timer.log(`evidence.json written (${sizeKb} KB, ${Object.keys(sources).length} sources)`);
timer.summary();
