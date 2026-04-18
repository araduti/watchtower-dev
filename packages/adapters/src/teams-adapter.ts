/**
 * Teams adapter — Microsoft Teams Tenant Admin API.
 *
 * Targets the same internal API the Teams PowerShell module uses:
 *   `https://api.interfaces.records.teams.microsoft.com{path}`
 *
 * Token scope is the same host's `.default`.  Each data source is one
 * configuration document (Global policy, etc.); responses are GET-only
 * singletons (no pagination).
 */

import type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
import { AdapterError } from "./adapter-error.ts";
import { decryptCredentialBundle } from "./credential-decrypt.ts";
import { getTenantSemaphore } from "./concurrency.ts";
import { normalizeKeys } from "./normalize.ts";
import { acquireSecretToken } from "./oauth.ts";
import { withRetry, classifyHttpStatus, type RetryDecision } from "./retry.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

const VENDOR_NAME = "teams" as const;
const DEFAULT_MAX_CONCURRENCY = 4;
const TEAMS_RESOURCE = "https://api.interfaces.records.teams.microsoft.com";
const SCOPE = `${TEAMS_RESOURCE}/.default`;

export interface TeamsAdapterConfig {
  readonly maxConcurrency?: number;
}

export interface TeamsDataSources {
  readonly [key: string]: unknown;
  teamsClientConfiguration: ReadonlyArray<Record<string, unknown>>;
  teamsExternalAccessPolicy: ReadonlyArray<Record<string, unknown>>;
  teamsFederationConfiguration: ReadonlyArray<Record<string, unknown>>;
  teamsMeetingPolicy: ReadonlyArray<Record<string, unknown>>;
  teamsMessagingPolicy: ReadonlyArray<Record<string, unknown>>;
}

export type TeamsDataSourceKey = keyof TeamsDataSources;

interface Endpoint {
  readonly path: string;
  /** PowerShell cmdlet name — sent as `X-MS-CmdletName` header. */
  readonly cmdlet: string;
}

const ENDPOINTS: Readonly<Record<TeamsDataSourceKey, Endpoint>> = {
  teamsClientConfiguration: {
    path: "/Skype.Policy/configurations/TeamsClientConfiguration/configuration/Global",
    cmdlet: "Get-CsTeamsClientConfiguration",
  },
  teamsExternalAccessPolicy: {
    path: "/Skype.Policy/configurations/ExternalAccessPolicy/configuration/Global",
    cmdlet: "Get-CsExternalAccessPolicy",
  },
  teamsFederationConfiguration: {
    path: "/Skype.Policy/configurations/TenantFederationSettings",
    cmdlet: "Get-CsTenantFederationConfiguration",
  },
  teamsMeetingPolicy: {
    path: "/Skype.Policy/configurations/TeamsMeetingPolicy/configuration/Global",
    cmdlet: "Get-CsTeamsMeetingPolicy",
  },
  teamsMessagingPolicy: {
    path: "/Skype.Policy/configurations/TeamsMessagingPolicy/configuration/Global",
    cmdlet: "Get-CsTeamsMessagingPolicy",
  },
};

const ALL_SOURCES = Object.keys(ENDPOINTS) as TeamsDataSourceKey[];

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(`Teams API failed (${status})`);
    this.name = "HttpError";
  }
}

function inspectRetry(err: unknown): RetryDecision {
  if (!(err instanceof HttpError)) return { retryable: false };
  const retry = err.status === 429 || (err.status >= 500 && err.status < 600);
  if (!retry) return { retryable: false };
  return {
    retryable: true,
    retryAfterMs:
      err.retryAfterSeconds !== undefined
        ? err.retryAfterSeconds * 1_000
        : undefined,
  };
}

function makeTranslate(dataSource: string) {
  return (err: unknown): AdapterError => {
    if (err instanceof AdapterError) return err;
    if (err instanceof HttpError) {
      const kind = classifyHttpStatus(err.status);
      const watchtowerError =
        kind === "rate_limited"
          ? WATCHTOWER_ERRORS.VENDOR.RATE_LIMITED
          : kind === "insufficient_scope"
            ? WATCHTOWER_ERRORS.VENDOR.INSUFFICIENT_SCOPE
            : kind === "credentials_invalid"
              ? WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID
              : WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR;
      return new AdapterError({
        message: `Teams API failed (${err.status}).`,
        kind,
        vendor: VENDOR_NAME,
        dataSource,
        vendorStatusCode: err.status,
        retryAfterSeconds: err.retryAfterSeconds,
        watchtowerError,
        cause: new Error(err.body.slice(0, 500)),
      });
    }
    return new AdapterError({
      message: err instanceof Error ? err.message : "Unknown Teams API error.",
      kind: "transient",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      cause: err,
    });
  };
}

async function fetchEndpoint(
  token: string,
  endpoint: Endpoint,
  dataSource: string,
): Promise<{ items: ReadonlyArray<Record<string, unknown>>; apiCalls: number }> {
  const url = `${TEAMS_RESOURCE}${endpoint.path}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "X-MS-CmdletName": endpoint.cmdlet,
    // Some intermediaries strip Accept-Encoding default — pin to identity to
    // avoid getting a gzip body the JSON parser cannot read.
    "Accept-Encoding": "identity",
    "User-Agent": "NONISV|Ampliosoft|Watchtower/1.0.0",
  };

  const translate = makeTranslate(dataSource);
  const json = await withRetry(
    async () => {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const ra = response.headers.get("Retry-After");
        throw new HttpError(
          response.status,
          text,
          ra ? Number(ra) : undefined,
        );
      }
      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new HttpError(response.status, text.slice(0, 500), undefined);
      }
    },
    inspectRetry,
    translate,
  );

  const norm = normalizeKeys(json);
  const items: Record<string, unknown>[] = [];
  if (Array.isArray(norm)) {
    for (const v of norm) {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        items.push(v as Record<string, unknown>);
      }
    }
  } else if (norm !== null && typeof norm === "object") {
    items.push(norm as Record<string, unknown>);
  }
  return { items, apiCalls: 1 };
}

export class TeamsAdapter implements VendorAdapter<TeamsDataSources> {
  readonly name = "teams" as const;

  constructor(private readonly teamsConfig: TeamsAdapterConfig = {}) {}

  async collect<K extends TeamsDataSourceKey & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<TeamsDataSources[K]>> {
    const endpoint = ENDPOINTS[source];
    if (!endpoint) {
      throw new AdapterError({
        message: `Unknown Teams data source: ${source}`,
        kind: "permanent",
        vendor: VENDOR_NAME,
        dataSource: source,
        watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      });
    }

    const maxConcurrency =
      this.teamsConfig.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const semaphore = getTenantSemaphore(
      VENDOR_NAME,
      config.workspaceId,
      config.tenantId,
      maxConcurrency,
    );

    await semaphore.acquire();
    try {
      const bundle = decryptCredentialBundle(
        config.encryptedCredentials,
        VENDOR_NAME,
        source,
      );
      const token = await acquireSecretToken({
        msTenantId: bundle.msTenantId,
        clientId: bundle.clientId,
        clientSecret: bundle.clientSecret,
        scope: SCOPE,
        vendor: VENDOR_NAME,
        dataSource: source,
      });

      const collectedAt = new Date().toISOString();
      const { items, apiCalls } = await fetchEndpoint(token, endpoint, source);

      return {
        data: items as TeamsDataSources[K],
        collectedAt,
        apiCallCount: apiCalls,
        missingScopes: [],
      };
    } finally {
      semaphore.release();
    }
  }

  listSources(): readonly (TeamsDataSourceKey & string)[] {
    return ALL_SOURCES as readonly (TeamsDataSourceKey & string)[];
  }

  requiredScopes(): readonly string[] {
    // Teams Tenant Admin API requires the application to be granted
    // application permission on the Microsoft Teams Service service
    // principal — there is no public scope name, but the assignment
    // role is "Teams Administrator".
    return [];
  }
}

export function createTeamsAdapter(
  teamsConfig: TeamsAdapterConfig = {},
): TeamsAdapter {
  return new TeamsAdapter(teamsConfig);
}
