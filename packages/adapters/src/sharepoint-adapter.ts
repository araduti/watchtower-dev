/**
 * SharePoint adapter — CSOM ProcessQuery via certificate-based JWT assertion.
 *
 * SharePoint Online's CSOM endpoint
 *   `https://{tenant}-admin.sharepoint.com/_vti_bin/client.svc/ProcessQuery`
 * rejects access tokens minted from `client_secret` for app-only scenarios
 * — only certificate-bearer tokens are accepted.  The adapter therefore
 * requires the optional `sharepointCertPem` + `sharepointCertThumbprint`
 * fields on the credential bundle.
 *
 * It exposes a single source today, `spoTenantSettings`, which returns the
 * full Tenant CSOM object (~200 properties) — the same shape that
 * `Get-PnPTenant` produces.  Additional CSOM types (sync client
 * restriction, etc.) can be added as new sources following the same pattern.
 *
 * NOTE: A `spoTenant` source key is already produced by the Microsoft Graph
 * adapter (`/admin/sharepoint/settings`), which exposes only a small subset
 * of properties.  The CSOM source here uses the distinct key
 * `spoTenantSettings` to avoid collision; evaluators that need the deep
 * properties can be migrated incrementally.
 */

import type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
import { AdapterError } from "./adapter-error.ts";
import { decryptCredentialBundle } from "./credential-decrypt.ts";
import { getTenantSemaphore } from "./concurrency.ts";
import { normalizeCsomKeys } from "./normalize.ts";
import { acquireCertificateToken } from "./oauth.ts";
import { withRetry, classifyHttpStatus, type RetryDecision } from "./retry.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

const VENDOR_NAME = "sharepoint" as const;
const DEFAULT_MAX_CONCURRENCY = 2;

// CSOM TypeId for the Microsoft.Online.SharePoint.TenantAdministration.Tenant
// class — stable across every tenant.
const TENANT_TYPE_ID = "{268004ae-ef6b-4e9b-8425-127220d84719}";

const CSOM_TENANT_QUERY = `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName=".NET Library" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009">
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

export interface SharePointAdapterConfig {
  readonly maxConcurrency?: number;
}

export interface SharePointDataSources {
  readonly [key: string]: unknown;
  /** Full CSOM tenant settings object (~200 properties). */
  spoTenantSettings: ReadonlyArray<Record<string, unknown>>;
}

export type SharePointDataSourceKey = keyof SharePointDataSources;

const ALL_SOURCES: readonly SharePointDataSourceKey[] = [
  "spoTenantSettings",
];

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(`SharePoint CSOM failed (${status})`);
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
        message: `SharePoint CSOM failed (${err.status}).`,
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
      message:
        err instanceof Error
          ? err.message
          : "Unknown SharePoint CSOM error.",
      kind: "transient",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      cause: err,
    });
  };
}

async function fetchTenantSettings(
  token: string,
  adminUrl: string,
  dataSource: string,
): Promise<{ items: ReadonlyArray<Record<string, unknown>>; apiCalls: number }> {
  const url = `${adminUrl}/_vti_bin/client.svc/ProcessQuery`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "text/xml",
    "User-Agent": "NONISV|Ampliosoft|Watchtower/1.0.0",
  };

  const translate = makeTranslate(dataSource);
  const json = await withRetry(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: CSOM_TENANT_QUERY,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const ra = response.headers.get("Retry-After");
        throw new HttpError(
          response.status,
          text,
          ra ? Number(ra) : undefined,
        );
      }
      return (await response.json()) as unknown;
    },
    inspectRetry,
    translate,
  );

  // Response is a heterogeneous array: [metadata, ...payload].  The tenant
  // object is the entry whose `_ObjectType_` includes "Tenant".
  if (!Array.isArray(json)) {
    throw new AdapterError({
      message: "SharePoint CSOM returned an unexpected response shape.",
      kind: "permanent",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
    });
  }

  const tenantRaw = json.find(
    (item): item is Record<string, unknown> =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>)["_ObjectType_"] === "string" &&
      ((item as Record<string, unknown>)["_ObjectType_"] as string).includes(
        "Tenant",
      ),
  );

  if (!tenantRaw) {
    throw new AdapterError({
      message: "SharePoint CSOM tenant object not found in response.",
      kind: "permanent",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
    });
  }

  const normalised = normalizeCsomKeys(tenantRaw);
  const items: Record<string, unknown>[] = [];
  if (
    normalised !== null &&
    typeof normalised === "object" &&
    !Array.isArray(normalised)
  ) {
    items.push(normalised as Record<string, unknown>);
  }
  return { items, apiCalls: 1 };
}

export class SharePointAdapter
  implements VendorAdapter<SharePointDataSources>
{
  readonly name = "sharepoint" as const;

  constructor(private readonly spoConfig: SharePointAdapterConfig = {}) {}

  async collect<K extends SharePointDataSourceKey & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<SharePointDataSources[K]>> {
    if (!ALL_SOURCES.includes(source as SharePointDataSourceKey)) {
      throw new AdapterError({
        message: `Unknown SharePoint data source: ${source}`,
        kind: "permanent",
        vendor: VENDOR_NAME,
        dataSource: source,
        watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      });
    }

    const maxConcurrency =
      this.spoConfig.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
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

      // Cert + tenant short-name are required.  Surface a clean
      // `credentials_invalid` so the scan pipeline can downgrade this source
      // for tenants that have not enrolled the SharePoint cert.
      if (
        !bundle.sharepointCertPem ||
        !bundle.sharepointCertThumbprint ||
        !bundle.spoTenantName
      ) {
        throw new AdapterError({
          message:
            "SharePoint adapter requires sharepointCertPem, " +
            "sharepointCertThumbprint, and spoTenantName in the credential " +
            "bundle.",
          kind: "credentials_invalid",
          vendor: VENDOR_NAME,
          dataSource: source,
          watchtowerError: WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID,
        });
      }

      const adminUrl = `https://${bundle.spoTenantName}-admin.sharepoint.com`;

      const token = await acquireCertificateToken({
        msTenantId: bundle.msTenantId,
        clientId: bundle.clientId,
        certPem: bundle.sharepointCertPem,
        certThumbprint: bundle.sharepointCertThumbprint,
        scope: `${adminUrl}/.default`,
        vendor: VENDOR_NAME,
        dataSource: source,
      });

      const collectedAt = new Date().toISOString();
      const { items, apiCalls } = await fetchTenantSettings(
        token,
        adminUrl,
        source,
      );

      return {
        data: items as SharePointDataSources[K],
        collectedAt,
        apiCallCount: apiCalls,
        missingScopes: [],
      };
    } finally {
      semaphore.release();
    }
  }

  listSources(): readonly (SharePointDataSourceKey & string)[] {
    return ALL_SOURCES as readonly (SharePointDataSourceKey & string)[];
  }

  requiredScopes(): readonly string[] {
    // App-only Sites.FullControl.All on the SharePoint resource, granted via
    // certificate-based authentication.
    return ["Sites.FullControl.All"];
  }
}

export function createSharePointAdapter(
  spoConfig: SharePointAdapterConfig = {},
): SharePointAdapter {
  return new SharePointAdapter(spoConfig);
}
