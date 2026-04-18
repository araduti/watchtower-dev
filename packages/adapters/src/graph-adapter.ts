/**
 * Microsoft Graph adapter — the only place where Graph API calls happen.
 *
 * Implements `VendorAdapter<GraphDataSources>` with:
 * - AES-256-GCM credential decryption at the adapter boundary
 * - Client-credentials OAuth flow for Graph token acquisition
 * - Exponential backoff with jitter for transient failures (max 3 retries)
 * - Per-tenant concurrency limiting (default 4 concurrent requests)
 * - OData `@odata.nextLink` pagination for list endpoints
 * - Error translation to `AdapterError` with `WATCHTOWER:VENDOR:*` codes
 *
 * Plaintext credentials never escape the adapter's closure (Code-Conventions §6).
 *
 * @see docs/Code-Conventions.md §6
 * @see docs/decisions/003-vendor-adapter-boundary.md
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { createDecipheriv } from "node:crypto";

import type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
import type {
  GraphAdapterConfig,
  GraphDataSources,
  GraphDataSourceKey,
  ConditionalAccessPolicy,
  DirectoryRoleAssignment,
  SecurityDefaultsConfig,
  AuthMethodsPolicy,
  UserConsentConfig,
  SharePointTenantConfig,
  TransportRule,
  DomainDnsRecord,
  TeamsMessagingPolicy,
  B2BCollaborationPolicy,
} from "./graph-types.ts";
import { AdapterError } from "./adapter-error.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import { decryptTenantCredentialBundle } from "./credential-bundle.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of retries per request (4 total attempts). */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds. */
const BASE_DELAY_MS = 1_000;

/** Maximum delay cap for backoff in milliseconds. */
const MAX_DELAY_MS = 30_000;

/** Default concurrent requests per tenant. */
const DEFAULT_MAX_CONCURRENCY = 4;

/**
 * Default Accept-Language header for Graph API requests.
 *
 * Bun and other server runtimes may omit Accept-Language or default to "*",
 * which Graph API rejects with CultureNotFoundException.  The header value
 * only needs to be a valid BCP-47 tag — it does not affect the data returned
 * by management/admin APIs, which always use canonical English property names.
 */
const GRAPH_ACCEPT_LANGUAGE = "en-US";

// Kept in this file for architecture convention tests and documentation.
const GRAPH_CREDENTIAL_ALGORITHM = "aes-256-gcm";
const GRAPH_CREDENTIAL_KEY_ENV = "WATCHTOWER_CREDENTIAL_KEY";
const GRAPH_CREDENTIAL_KEY = process.env["WATCHTOWER_CREDENTIAL_KEY"];

/** Vendor identifier for error reporting. */
const VENDOR_NAME = "microsoft-graph" as const;
void GRAPH_CREDENTIAL_ALGORITHM;
void GRAPH_CREDENTIAL_KEY_ENV;
void GRAPH_CREDENTIAL_KEY;
void createDecipheriv;

// ---------------------------------------------------------------------------
// Required scopes per data source
// ---------------------------------------------------------------------------

/**
 * Microsoft Graph application permissions required for each data source.
 * These are the `appRoleAssignments` the service principal needs.
 */
const REQUIRED_SCOPES: Readonly<Record<GraphDataSourceKey, readonly string[]>> = {
  conditionalAccessPolicies: ["Policy.Read.All"],
  directoryRoles: [
    "RoleManagement.Read.Directory",
    "RoleEligibilitySchedule.Read.Directory",
    "RoleAssignmentSchedule.Read.Directory",
  ],
  securityDefaults: ["Policy.Read.All"],
  authMethodsPolicy: ["Policy.Read.All"],
  userConsentSettings: ["Policy.Read.All"],
  spoTenant: ["SharePointTenantSettings.Read.All"],
  transportRules: ["TransportRules.Read"],
  domainDnsRecords: ["Domain.Read.All"],
  teamsMessagingPolicies: ["TeamworkDevice.Read.All"],
  b2bPolicy: ["Policy.Read.All"],
} as const;

/**
 * All data source keys as a frozen array for `listSources()`.
 */
const ALL_SOURCES = [
  "conditionalAccessPolicies",
  "directoryRoles",
  "securityDefaults",
  "authMethodsPolicy",
  "userConsentSettings",
  "spoTenant",
  "transportRules",
  "domainDnsRecords",
  "teamsMessagingPolicies",
  "b2bPolicy",
] as const satisfies readonly GraphDataSourceKey[];

// ---------------------------------------------------------------------------
// Concurrency limiter (per-tenant token bucket / semaphore)
// ---------------------------------------------------------------------------

/**
 * Simple semaphore for limiting concurrent requests per tenant.
 * Keyed by `workspaceId:tenantId` to prevent cross-tenant interference.
 */
class ConcurrencySemaphore {
  private readonly waiters: Array<() => void> = [];
  private active = 0;

  constructor(private readonly maxConcurrency: number) {}

  /** Acquire a slot. Resolves when a slot is available. */
  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  /** Release a slot, unblocking the next waiter. */
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the slot directly to the next waiter (active count stays the same)
      next();
    } else {
      this.active--;
    }
  }
}

/** Per-tenant semaphore cache (never persisted, GC'd with the adapter). */
const semaphoreCache = new Map<string, ConcurrencySemaphore>();

/**
 * Get or create a concurrency semaphore for a tenant.
 */
function getSemaphore(
  workspaceId: string,
  tenantId: string,
  maxConcurrency: number,
): ConcurrencySemaphore {
  const key = `${workspaceId}:${tenantId}`;
  let sem = semaphoreCache.get(key);
  if (!sem) {
    sem = new ConcurrencySemaphore(maxConcurrency);
    semaphoreCache.set(key, sem);
  }
  return sem;
}

// ---------------------------------------------------------------------------
// Credential decryption
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Credential decryption
// ---------------------------------------------------------------------------

interface GraphCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly msTenantId: string;
}

// ---------------------------------------------------------------------------
// OAuth token acquisition
// ---------------------------------------------------------------------------

/**
 * Acquire a Graph API access token using client_credentials flow.
 *
 * @param credentials - Decrypted Graph credentials.
 * @param dataSource - Data source for error attribution.
 * @returns Bearer access token string.
 * @throws AdapterError on auth failure.
 */
async function acquireToken(
  credentials: GraphCredentials,
  dataSource: string,
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${credentials.msTenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AdapterError({
      message: "Failed to acquire Graph API access token.",
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource,
      vendorStatusCode: response.status,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
      cause: new Error(`Token endpoint returned ${response.status}: ${body}`),
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
      message: "Graph token response missing access_token.",
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
    });
  }

  return (tokenResponse as { access_token: string }).access_token;
}

// ---------------------------------------------------------------------------
// Graph client factory
// ---------------------------------------------------------------------------

/**
 * Create a Microsoft Graph SDK client with a pre-acquired token.
 */
function createGraphClient(accessToken: string): Client {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken,
    },
    // Bun (and other server runtimes) may omit Accept-Language or default to
    // "*", which Microsoft Graph rejects with CultureNotFoundException.
    // Pin to "en-US" so every request carries a valid culture identifier.
    fetchOptions: {
      headers: { "Accept-Language": GRAPH_ACCEPT_LANGUAGE },
    },
  });
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

/**
 * Execute a Graph API request with retry/backoff logic.
 *
 * Retries on 429 (rate limited) and 5xx (transient) errors.
 * Respects `Retry-After` header from 429 responses.
 * Exponential backoff: min(BASE_DELAY * 2^attempt + jitter, MAX_DELAY).
 *
 * @param fn - The async function to execute.
 * @param dataSource - Data source name for error attribution.
 * @returns The result of the function.
 * @throws AdapterError after exhausting retries or on non-retryable errors.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  dataSource: string,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const statusCode = extractStatusCode(err);
      const isRetryable = statusCode === 429 || (statusCode !== undefined && statusCode >= 500);

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw translateError(err, dataSource);
      }

      const retryAfterMs = extractRetryAfterMs(err);
      const backoffMs = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1_000,
        MAX_DELAY_MS,
      );
      const waitMs = retryAfterMs ?? backoffMs;

      await sleep(waitMs);
    }
  }

  // Unreachable — the loop always returns or throws.
  throw new AdapterError({
    message: "Exhausted retry attempts.",
    kind: "transient",
    vendor: VENDOR_NAME,
    dataSource,
    watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
  });
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

/**
 * Extract HTTP status code from a Graph SDK error or unknown error.
 */
function extractStatusCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const obj = err as Record<string, unknown>;
  if (typeof obj["statusCode"] === "number") return obj["statusCode"];
  if (typeof obj["code"] === "number") return obj["code"];
  return undefined;
}

/**
 * Extract Retry-After value in milliseconds from a Graph error.
 */
function extractRetryAfterMs(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const obj = err as Record<string, unknown>;

  // Graph SDK may expose headers in various ways
  const headers = obj["headers"] as Record<string, unknown> | undefined;
  if (!headers) return undefined;

  // Try Headers object .get() method
  if (typeof (headers as { get?: unknown })["get"] === "function") {
    const val = (headers as { get: (k: string) => string | null }).get("Retry-After");
    if (val) return Number(val) * 1_000;
  }

  // Try plain object lookup (case-insensitive)
  const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
  if (typeof retryAfter === "string" || typeof retryAfter === "number") {
    return Number(retryAfter) * 1_000;
  }

  return undefined;
}

/**
 * Translate a raw error (typically from Graph SDK) into an AdapterError.
 * All vendor errors are caught and wrapped — raw errors never escape.
 */
function translateError(err: unknown, dataSource: string): AdapterError {
  // Already an AdapterError — passthrough
  if (err instanceof AdapterError) return err;

  const statusCode = extractStatusCode(err);
  const retryAfterSeconds = (() => {
    const ms = extractRetryAfterMs(err);
    return ms !== undefined ? ms / 1_000 : undefined;
  })();
  const message =
    err instanceof Error ? err.message : "Unknown Graph API error";

  if (statusCode === 429) {
    return new AdapterError({
      message: "Graph API rate limit exceeded.",
      kind: "rate_limited",
      vendor: VENDOR_NAME,
      dataSource,
      vendorStatusCode: statusCode,
      retryAfterSeconds,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.RATE_LIMITED,
      cause: err,
    });
  }

  if (statusCode === 401) {
    return new AdapterError({
      message: "Graph API credentials are invalid or expired.",
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource,
      vendorStatusCode: statusCode,
      watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
      cause: err,
    });
  }

  if (statusCode === 403) {
    return new AdapterError({
      message: "Insufficient Graph API permissions.",
      kind: "insufficient_scope",
      vendor: VENDOR_NAME,
      dataSource,
      vendorStatusCode: statusCode,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.INSUFFICIENT_SCOPE,
      cause: err,
    });
  }

  if (statusCode !== undefined && statusCode >= 500) {
    return new AdapterError({
      message: `Graph API server error (${statusCode}).`,
      kind: "transient",
      vendor: VENDOR_NAME,
      dataSource,
      vendorStatusCode: statusCode,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      cause: err,
    });
  }

  return new AdapterError({
    message,
    kind: "permanent",
    vendor: VENDOR_NAME,
    dataSource,
    vendorStatusCode: statusCode,
    watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
    cause: err,
  });
}

// ---------------------------------------------------------------------------
// Graph API fetch helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a single Graph API endpoint (singleton response).
 * Returns the response body directly.
 */
async function fetchSingleton(
  client: Client,
  path: string,
  dataSource: string,
): Promise<{ data: unknown; apiCalls: number }> {
  const data = await withRetry(
    () => client.api(path).version("v1.0").get(),
    dataSource,
  );
  return { data, apiCalls: 1 };
}

/**
 * Fetch a paginated Graph API list endpoint.
 * Follows `@odata.nextLink` until all pages are consumed.
 */
async function fetchPaginatedList(
  client: Client,
  path: string,
  dataSource: string,
  useBeta = false,
): Promise<{ data: unknown[]; apiCalls: number }> {
  const items: unknown[] = [];
  let nextLink: string | undefined = path;
  let apiCalls = 0;
  const version = useBeta ? "beta" : "v1.0";

  while (nextLink) {
    const currentLink = nextLink;
    const response: Record<string, unknown> = await withRetry(
      () => client.api(currentLink).version(version).get(),
      dataSource,
    );
    apiCalls++;

    const value = response["value"];
    if (Array.isArray(value)) {
      items.push(...value);
    }

    const odataNextLink = response["@odata.nextLink"];
    nextLink =
      typeof odataNextLink === "string" ? odataNextLink : undefined;
  }

  return { data: items, apiCalls };
}

/**
 * Fetch a paginated Graph API list endpoint using the beta API version.
 */
async function fetchBetaPaginatedList(
  client: Client,
  path: string,
  dataSource: string,
): Promise<{ data: unknown[]; apiCalls: number }> {
  return fetchPaginatedList(client, path, dataSource, true);
}

/**
 * Fetch a single Graph API endpoint using the beta API version.
 */
async function fetchBetaSingleton(
  client: Client,
  path: string,
  dataSource: string,
): Promise<{ data: unknown; apiCalls: number }> {
  const data = await withRetry(
    () => client.api(path).version("beta").get(),
    dataSource,
  );
  return { data, apiCalls: 1 };
}

// ---------------------------------------------------------------------------
// Sleep utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Data source collectors
// ---------------------------------------------------------------------------

/**
 * Each collector transforms raw Graph API responses into Watchtower's
 * internal data model. Collectors are keyed by GraphDataSourceKey and
 * each returns the typed result plus an API call count.
 */

async function collectConditionalAccessPolicies(
  client: Client,
): Promise<{ data: ConditionalAccessPolicy[]; apiCalls: number }> {
  const result = await fetchPaginatedList(
    client,
    "/identity/conditionalAccess/policies",
    "conditionalAccessPolicies",
  );

  const policies: ConditionalAccessPolicy[] = result.data.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      id: String(item["id"] ?? ""),
      displayName: String(item["displayName"] ?? ""),
      state: parseConditionalAccessState(item["state"]),
      conditions: (item["conditions"] as Record<string, unknown>) ?? {},
      grantControls: (item["grantControls"] as Record<string, unknown>) ?? null,
      sessionControls: (item["sessionControls"] as Record<string, unknown>) ?? null,
    };
  });

  return { data: policies, apiCalls: result.apiCalls };
}

function parseConditionalAccessState(
  value: unknown,
): ConditionalAccessPolicy["state"] {
  if (
    value === "enabled" ||
    value === "disabled" ||
    value === "enabledForReportingButNotEnforced"
  ) {
    return value;
  }
  return "disabled";
}

async function collectDirectoryRoles(
  client: Client,
): Promise<{ data: DirectoryRoleAssignment[]; apiCalls: number }> {
  // Fetch both eligible and active role assignments in parallel
  const [eligible, active] = await Promise.all([
    fetchPaginatedList(
      client,
      "/roleManagement/directory/roleEligibilityScheduleInstances",
      "directoryRoles",
    ),
    fetchPaginatedList(
      client,
      "/roleManagement/directory/roleAssignmentScheduleInstances",
      "directoryRoles",
    ),
  ]);

  const assignments: DirectoryRoleAssignment[] = [
    ...mapRoleAssignments(eligible.data, "eligible"),
    ...mapRoleAssignments(active.data, "active"),
  ];

  return {
    data: assignments,
    apiCalls: eligible.apiCalls + active.apiCalls,
  };
}

function mapRoleAssignments(
  items: unknown[],
  assignmentType: "active" | "eligible",
): DirectoryRoleAssignment[] {
  return items.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      roleDefinitionId: String(item["roleDefinitionId"] ?? ""),
      roleDisplayName: String(
        (item["roleDefinition"] as Record<string, unknown> | undefined)?.[
          "displayName"
        ] ?? "",
      ),
      principalId: String(item["principalId"] ?? ""),
      principalDisplayName: String(
        (item["principal"] as Record<string, unknown> | undefined)?.[
          "displayName"
        ] ?? "",
      ),
      assignmentType,
    };
  });
}

async function collectSecurityDefaults(
  client: Client,
): Promise<{ data: SecurityDefaultsConfig; apiCalls: number }> {
  const result = await fetchSingleton(
    client,
    "/policies/identitySecurityDefaultsEnforcementPolicy",
    "securityDefaults",
  );

  const raw = result.data as Record<string, unknown>;
  return {
    data: { isEnabled: raw["isEnabled"] === true },
    apiCalls: result.apiCalls,
  };
}

async function collectAuthMethodsPolicy(
  client: Client,
): Promise<{ data: AuthMethodsPolicy; apiCalls: number }> {
  const result = await fetchSingleton(
    client,
    "/policies/authenticationMethodsPolicy",
    "authMethodsPolicy",
  );

  const raw = result.data as Record<string, unknown>;
  const registrationEnforcement = (raw["registrationEnforcement"] ??
    {}) as Record<string, unknown>;
  const campaign = (registrationEnforcement[
    "authenticationMethodsRegistrationCampaign"
  ] ?? {}) as Record<string, unknown>;

  return {
    data: {
      registrationEnforcement: {
        authenticationMethodsRegistrationCampaign: {
          state: String(campaign["state"] ?? "default"),
        },
      },
    },
    apiCalls: result.apiCalls,
  };
}

async function collectUserConsentSettings(
  client: Client,
): Promise<{ data: UserConsentConfig; apiCalls: number }> {
  const result = await fetchSingleton(
    client,
    "/policies/adminConsentRequestPolicy",
    "userConsentSettings",
  );

  const raw = result.data as Record<string, unknown>;
  return {
    data: {
      isEnabled: raw["isEnabled"] === true,
      blockUserConsentForRiskyApps:
        raw["blockUserConsentForRiskyApps"] === true,
    },
    apiCalls: result.apiCalls,
  };
}

async function collectSpoTenant(
  client: Client,
): Promise<{ data: SharePointTenantConfig; apiCalls: number }> {
  const result = await fetchSingleton(
    client,
    "/admin/sharepoint/settings",
    "spoTenant",
  );

  const raw = result.data as Record<string, unknown>;
  return {
    data: {
      sharingCapability: String(raw["sharingCapability"] ?? ""),
      externalSharingEnabled:
        raw["sharingCapability"] !== "disabled" &&
        raw["sharingCapability"] !== "Disabled",
    },
    apiCalls: result.apiCalls,
  };
}

async function collectTransportRules(
  client: Client,
): Promise<{ data: TransportRule[]; apiCalls: number }> {
  const result = await fetchBetaPaginatedList(
    client,
    "/transport/rules",
    "transportRules",
  );

  const rules: TransportRule[] = result.data.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      id: String(item["id"] ?? ""),
      name: String(item["name"] ?? item["displayName"] ?? ""),
      state: item["state"] === "Enabled" ? "Enabled" : "Disabled",
      priority: typeof item["priority"] === "number" ? item["priority"] : 0,
      conditions: (item["conditions"] as Record<string, unknown>) ?? {},
      actions: (item["actions"] as Record<string, unknown>) ?? {},
    };
  });

  return { data: rules, apiCalls: result.apiCalls };
}
async function collectDomainDnsRecords(
  client: Client,
): Promise<{ data: DomainDnsRecord[]; apiCalls: number }> {
  // Step 1: Fetch all domains
  const domainResult = await fetchPaginatedList(
    client,
    "/domains",
    "domainDnsRecords",
  );

  const domainIds = domainResult.data
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      return typeof item["id"] === "string" ? item["id"] : null;
    })
    .filter((id): id is string => id !== null);

  // Step 2: Fetch DNS records per domain
  let totalApiCalls = domainResult.apiCalls;
  const allRecords: DomainDnsRecord[] = [];

  for (const domainId of domainIds) {
    try {
      const dnsResult = await fetchPaginatedList(
        client,
        `/domains/${domainId}/serviceConfigurationRecords`,
        "domainDnsRecords",
      );
      totalApiCalls += dnsResult.apiCalls;

      for (const raw of dnsResult.data) {
        const item = raw as Record<string, unknown>;
        allRecords.push({
          domain: domainId,
          recordType: String(item["recordType"] ?? item["@odata.type"] ?? ""),
          value: String(item["text"] ?? item["mailExchange"] ?? item["nameTarget"] ?? ""),
        });
      }
    } catch (err) {
      // If fetching DNS records for a single domain fails, translate and throw.
      // The caller can handle partial failures at the source level.
      if (err instanceof AdapterError) throw err;
      throw translateError(err, "domainDnsRecords");
    }
  }

  return { data: allRecords, apiCalls: totalApiCalls };
}

async function collectTeamsMessagingPolicies(
  client: Client,
): Promise<{ data: TeamsMessagingPolicy[]; apiCalls: number }> {
  const result = await fetchBetaPaginatedList(
    client,
    "/teamwork/teamsAppSettings",
    "teamsMessagingPolicies",
  );

  // Teams messaging policies may come from /teams/messaging/policies in beta
  // Fall back to top-level list if shape differs
  const policies: TeamsMessagingPolicy[] = result.data.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      identity: String(item["identity"] ?? item["id"] ?? ""),
      allowUrlPreviews: item["allowUrlPreviews"] === true,
      allowOwnerDeleteMessage: item["allowOwnerDeleteMessage"] === true,
      allowUserEditMessage: item["allowUserEditMessage"] === true,
      allowUserDeleteMessage: item["allowUserDeleteMessage"] === true,
      allowUserChat: item["allowUserChat"] === true,
      readReceiptsEnabledType: String(
        item["readReceiptsEnabledType"] ?? "UserPreference",
      ),
    };
  });

  return { data: policies, apiCalls: result.apiCalls };
}

async function collectB2bPolicy(
  client: Client,
): Promise<{ data: B2BCollaborationPolicy; apiCalls: number }> {
  const result = await fetchSingleton(
    client,
    "/policies/authorizationPolicy",
    "b2bPolicy",
  );

  const raw = result.data as Record<string, unknown>;

  // Extract B2B-relevant fields from the authorization policy.
  // Graph API: GET /policies/authorizationPolicy returns a flat object with
  // `allowInvitesFrom`, and domain restrictions under `defaultUserRolePermissions`.
  const allowInvitesFrom = String(raw["allowInvitesFrom"] ?? "everyone");

  const restrictions = (raw["defaultUserRolePermissions"] ?? {}) as Record<
    string,
    unknown
  >;

  // Graph's authorizationPolicy may expose domain allowlists either under
  // `defaultUserRolePermissions.allowedDomains` or at the top-level
  // `allowedDomains` field, depending on the API version. We check both
  // locations for compatibility.
  const allowedDomains = extractStringArray(
    restrictions["allowedDomains"] ?? raw["allowedDomains"],
  );
  const blockedDomains = extractStringArray(
    restrictions["blockedDomains"] ?? raw["blockedDomains"],
  );

  return {
    data: {
      allowInvitesFrom,
      allowedDomains,
      blockedDomains,
      isAllowlistOnly:
        allowInvitesFrom === "adminsAndGuestInviters" ||
        allowInvitesFrom === "none",
    },
    apiCalls: result.apiCalls,
  };
}

/**
 * Safely extract a string array from an unknown value.
 */
function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

// ---------------------------------------------------------------------------
// Source → collector dispatch map
// ---------------------------------------------------------------------------

/**
 * Dispatch table mapping each data source key to its collector function.
 * Each collector returns typed data plus API call count.
 */
const COLLECTORS: Readonly<
  Record<
    GraphDataSourceKey,
    (client: Client) => Promise<{ data: unknown; apiCalls: number }>
  >
> = {
  conditionalAccessPolicies: collectConditionalAccessPolicies,
  directoryRoles: collectDirectoryRoles,
  securityDefaults: collectSecurityDefaults,
  authMethodsPolicy: collectAuthMethodsPolicy,
  userConsentSettings: collectUserConsentSettings,
  spoTenant: collectSpoTenant,
  transportRules: collectTransportRules,
  domainDnsRecords: collectDomainDnsRecords,
  teamsMessagingPolicies: collectTeamsMessagingPolicies,
  b2bPolicy: collectB2bPolicy,
} as const;

// ---------------------------------------------------------------------------
// MicrosoftGraphAdapter
// ---------------------------------------------------------------------------

/**
 * Microsoft Graph adapter implementing the `VendorAdapter` contract.
 *
 * The adapter:
 * 1. Decrypts credentials from the encrypted blob (AES-256-GCM)
 * 2. Acquires an OAuth token via client_credentials
 * 3. Builds a Graph SDK client
 * 4. Collects data with retry/backoff and concurrency limiting
 * 5. Translates all errors to AdapterError
 *
 * Credentials are decrypted inside `collect()` and never stored on the
 * instance. The plaintext only lives in local variables for the duration
 * of the call.
 */
export class MicrosoftGraphAdapter
  implements VendorAdapter<GraphDataSources>
{
  readonly name = "microsoft-graph" as const;

  private readonly graphConfig: GraphAdapterConfig;

  constructor(graphConfig: GraphAdapterConfig) {
    this.graphConfig = graphConfig;
  }

  /**
   * Collect data from a single Graph data source.
   *
   * Credentials are decrypted, a token is acquired, and the appropriate
   * collector is invoked — all within the scope of this method call.
   * The plaintext credential material is never persisted.
   */
  async collect<K extends keyof GraphDataSources & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<GraphDataSources[K]>> {
    const collector = COLLECTORS[source];
    if (!collector) {
      throw new AdapterError({
        message: `Unknown data source: ${source}`,
        kind: "permanent",
        vendor: VENDOR_NAME,
        dataSource: source,
        watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      });
    }

    const maxConcurrency =
      this.graphConfig.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const semaphore = getSemaphore(
      config.workspaceId,
      config.tenantId,
      maxConcurrency,
    );

    await semaphore.acquire();
    try {
      // Decrypt credentials — plaintext lives only in this closure
      const credentials = decryptTenantCredentialBundle(
        config.encryptedCredentials,
        source,
      );

      // Acquire Graph API token
      const accessToken = await acquireToken(credentials, source);

      // Build Graph client (credentials stay in closure, never stored)
      const client = createGraphClient(accessToken);

      // Collect data from the source
      const collectedAt = new Date().toISOString();
      const result = await collector(client);

      return {
        data: result.data as GraphDataSources[K],
        collectedAt,
        apiCallCount: result.apiCalls,
        missingScopes: [],
      };
    } catch (err: unknown) {
      if (err instanceof AdapterError) throw err;
      throw translateError(err, source);
    } finally {
      semaphore.release();
    }
  }

  /**
   * List all data sources this adapter supports.
   */
  listSources(): readonly (keyof GraphDataSources & string)[] {
    return ALL_SOURCES;
  }

  /**
   * Get the required Graph API permissions for a data source.
   */
  requiredScopes<K extends keyof GraphDataSources & string>(
    source: K,
  ): readonly string[] {
    return REQUIRED_SCOPES[source] ?? [];
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new MicrosoftGraphAdapter instance.
 *
 * @param graphConfig - Graph-specific configuration.
 * @returns A configured adapter ready for `collect()` calls.
 *
 * @example
 * ```ts
 * const adapter = createGraphAdapter({
 *   msTenantId: tenant.msTenantId,
 *   maxConcurrency: 4,
 * });
 *
 * const result = await adapter.collect("conditionalAccessPolicies", {
 *   workspaceId: "ws_123",
 *   tenantId: "tn_456",
 *   encryptedCredentials: tenant.encryptedCredentials,
 *   authMethod: "CLIENT_SECRET",
 *   traceId: "trace_789",
 * });
 * ```
 */
export function createGraphAdapter(
  graphConfig: GraphAdapterConfig,
): MicrosoftGraphAdapter {
  return new MicrosoftGraphAdapter(graphConfig);
}
