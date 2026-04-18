/**
 * Compliance adapter — Microsoft Purview / Security & Compliance Center.
 *
 * The transport mirrors Exchange Online's InvokeCommand pattern, but targets
 * a different host:
 *   `https://ps.compliance.protection.outlook.com/adminapi/beta/{tenant}/InvokeCommand`
 *
 * Token scope is `https://ps.compliance.protection.outlook.com/.default`.
 */

import type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
import { AdapterError } from "./adapter-error.ts";
import { decryptCredentialBundle } from "./credential-decrypt.ts";
import { getTenantSemaphore } from "./concurrency.ts";
import { normalizeKeys } from "./normalize.ts";
import { acquireSecretToken } from "./oauth.ts";
import { withRetry, classifyHttpStatus, type RetryDecision } from "./retry.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

const VENDOR_NAME = "compliance" as const;
const DEFAULT_MAX_CONCURRENCY = 4;
const SCOPE = "https://ps.compliance.protection.outlook.com/.default";

export interface ComplianceAdapterConfig {
  readonly maxConcurrency?: number;
}

export interface ComplianceDataSources {
  readonly [key: string]: unknown;
  /** Sensitivity label policies (`Get-LabelPolicy`). CIS 3.3.1. */
  labelPolicies: ReadonlyArray<Record<string, unknown>>;
  /** Sensitivity labels (`Get-Label`). CIS 3.3.1 catalog. */
  sensitivityLabels: ReadonlyArray<Record<string, unknown>>;
  /** DLP policies (`Get-DlpCompliancePolicy`). CIS 3.2.1, 3.2.2. */
  dlpPolicies: ReadonlyArray<Record<string, unknown>>;
}

export type ComplianceDataSourceKey = keyof ComplianceDataSources;

interface Workload {
  readonly cmdlet: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

const WORKLOADS: Readonly<Record<ComplianceDataSourceKey, Workload>> = {
  labelPolicies: { cmdlet: "Get-LabelPolicy" },
  sensitivityLabels: { cmdlet: "Get-Label" },
  dlpPolicies: { cmdlet: "Get-DlpCompliancePolicy" },
};

const ALL_SOURCES = Object.keys(WORKLOADS) as ComplianceDataSourceKey[];

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(`Compliance InvokeCommand failed (${status})`);
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
        message: `Compliance InvokeCommand failed (${err.status}).`,
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
          : "Unknown Compliance API error.",
      kind: "transient",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      cause: err,
    });
  };
}

async function invokeCommand(
  token: string,
  msTenantId: string,
  complianceTenantName: string | undefined,
  cmdlet: string,
  parameters: Readonly<Record<string, unknown>>,
  dataSource: string,
): Promise<{ items: ReadonlyArray<Record<string, unknown>>; apiCalls: number }> {
  const tenantSegment = complianceTenantName ?? msTenantId;
  const baseUrl = `https://ps.compliance.protection.outlook.com/adminapi/beta/${tenantSegment}/InvokeCommand`;
  const anchor = `SystemMailbox{bb558c35-97f1-4cb9-8ff7-d53741dc928c}@${tenantSegment}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-ResponseFormat": "json",
    "X-AnchorMailbox": anchor,
    "Prefer": "odata.maxpagesize=1000",
  };
  const body = JSON.stringify({
    CmdletInput: { CmdletName: cmdlet, Parameters: parameters },
  });

  const items: Record<string, unknown>[] = [];
  let url: string | null = baseUrl;
  let apiCalls = 0;
  const translate = makeTranslate(dataSource);

  while (url) {
    const target: string = url;
    const json: Record<string, unknown> = await withRetry(
      async (): Promise<Record<string, unknown>> => {
        const response = await fetch(target, { method: "POST", headers, body });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const ra = response.headers.get("Retry-After");
          throw new HttpError(
            response.status,
            text,
            ra ? Number(ra) : undefined,
          );
        }
        return (await response.json()) as Record<string, unknown>;
      },
      inspectRetry,
      translate,
    );
    apiCalls++;

    const rawValue = json["value"];
    const rawArray = Array.isArray(rawValue)
      ? rawValue
      : Array.isArray(json)
        ? json
        : [json];
    for (const row of rawArray) {
      const norm = normalizeKeys(row);
      if (norm !== null && typeof norm === "object" && !Array.isArray(norm)) {
        items.push(norm as Record<string, unknown>);
      }
    }

    const next: unknown = json["@odata.nextLink"];
    url = typeof next === "string" ? next : null;
  }

  return { items, apiCalls };
}

export class ComplianceAdapter
  implements VendorAdapter<ComplianceDataSources>
{
  readonly name = "compliance" as const;

  constructor(private readonly complianceConfig: ComplianceAdapterConfig = {}) {}

  async collect<K extends ComplianceDataSourceKey & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<ComplianceDataSources[K]>> {
    const workload = WORKLOADS[source];
    if (!workload) {
      throw new AdapterError({
        message: `Unknown Compliance data source: ${source}`,
        kind: "permanent",
        vendor: VENDOR_NAME,
        dataSource: source,
        watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      });
    }

    const maxConcurrency =
      this.complianceConfig.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
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
      const { items, apiCalls } = await invokeCommand(
        token,
        bundle.msTenantId,
        bundle.complianceTenantName,
        workload.cmdlet,
        workload.params ?? {},
        source,
      );

      return {
        data: items as ComplianceDataSources[K],
        collectedAt,
        apiCallCount: apiCalls,
        missingScopes: [],
      };
    } finally {
      semaphore.release();
    }
  }

  listSources(): readonly (ComplianceDataSourceKey & string)[] {
    return ALL_SOURCES as readonly (ComplianceDataSourceKey & string)[];
  }

  requiredScopes(): readonly string[] {
    // Compliance InvokeCommand requires the same Exchange.ManageAsApp role
    // assigned to the Compliance Administrator role.
    return ["Exchange.ManageAsApp"];
  }
}

export function createComplianceAdapter(
  complianceConfig: ComplianceAdapterConfig = {},
): ComplianceAdapter {
  return new ComplianceAdapter(complianceConfig);
}
