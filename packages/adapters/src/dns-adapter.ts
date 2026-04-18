/**
 * DNS adapter — performs real DNS lookups for verified directory domains.
 *
 * The "vendor" is the public DNS resolver reachable from the host.  There is
 * no API token, no rate limit beyond what the OS resolver enforces.
 *
 * Cross-adapter dependency: the verified-domain list is collected by the
 * Microsoft Graph adapter (`domains` source).  The scan pipeline must run
 * the Graph adapter first and pass the result through
 * `AdapterConfig.dependencies["domains"]`.  When the dependency is missing
 * entirely the adapter raises `AdapterError(kind=permanent)` so the scan
 * operator can debug the ordering issue rather than silently producing an
 * empty snapshot.
 *
 * The adapter exposes a single source, `domainDnsRecords`, with a shape
 * compatible with the existing DMARC / SPF / DKIM evaluators in
 * `packages/engine/evaluators/builtin/`:
 *
 *   { domain, spf: string[], dmarc: string[], dkim: string[], mx: string[] }
 */

import { resolveTxt, resolveMx } from "node:dns/promises";

import type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
import { AdapterError } from "./adapter-error.ts";
import { getTenantSemaphore } from "./concurrency.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

const VENDOR_NAME = "dns" as const;
const DEFAULT_MAX_CONCURRENCY = 8;

export interface DnsAdapterConfig {
  readonly maxConcurrency?: number;
}

/** Per-domain DNS record bundle — one entry per verified domain. */
export interface DomainDnsRecords {
  readonly domain: string;
  readonly spf: ReadonlyArray<string>;
  readonly dmarc: ReadonlyArray<string>;
  readonly dkim: ReadonlyArray<string>;
  readonly mx: ReadonlyArray<string>;
}

export interface DnsDataSources {
  readonly [key: string]: unknown;
  domainDnsRecords: ReadonlyArray<DomainDnsRecords>;
}

export type DnsDataSourceKey = keyof DnsDataSources;

const ALL_SOURCES: readonly DnsDataSourceKey[] = ["domainDnsRecords"];

/** Shape we accept from the Graph adapter's `domains` source dependency. */
interface VerifiedDomainHint {
  readonly id?: unknown;
  readonly isVerified?: unknown;
}

function extractVerifiedDomains(deps: unknown): readonly string[] {
  if (!deps || typeof deps !== "object") return [];
  const domains = (deps as Record<string, unknown>)["domains"];
  if (!Array.isArray(domains)) return [];

  const out: string[] = [];
  for (const entry of domains) {
    if (entry === null || typeof entry !== "object") continue;
    const d = entry as VerifiedDomainHint;
    if (d.isVerified === false) continue; // skip explicitly unverified
    if (typeof d.id === "string" && d.id.length > 0) out.push(d.id);
  }
  return out;
}

async function lookupTxt(name: string): Promise<string[]> {
  try {
    const records = await resolveTxt(name);
    return records.map((rr) => rr.join(""));
  } catch (err) {
    // Treat NXDOMAIN/NODATA as empty — these are normal "no record published"
    // cases that the evaluators interpret as a finding, not a collection
    // error.  Any other DNS failure is a real error and is rethrown.
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code: unknown }).code
        : undefined;
    if (code === "ENOTFOUND" || code === "ENODATA") return [];
    throw err;
  }
}

async function lookupMx(name: string): Promise<string[]> {
  try {
    const records = await resolveMx(name);
    return records.map((rr) => `${rr.priority} ${rr.exchange}`);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code: unknown }).code
        : undefined;
    if (code === "ENOTFOUND" || code === "ENODATA") return [];
    throw err;
  }
}

/**
 * Resolve SPF/DMARC/DKIM/MX for a single domain.  All four queries run in
 * parallel — the per-tenant semaphore caps the *number of domains* being
 * processed concurrently, not the queries per domain.
 */
async function resolveDomain(domain: string): Promise<DomainDnsRecords> {
  const [spfRaw, dmarcRaw, dkim1, dkim2, mxRaw] = await Promise.all([
    lookupTxt(domain),
    lookupTxt(`_dmarc.${domain}`),
    lookupTxt(`selector1._domainkey.${domain}`),
    lookupTxt(`selector2._domainkey.${domain}`),
    lookupMx(domain),
  ]);

  return {
    domain,
    spf: spfRaw.filter((r) => r.startsWith("v=spf1")),
    dmarc: dmarcRaw.filter((r) => r.startsWith("v=DMARC1")),
    dkim: [
      ...dkim1.filter((r) => r.includes("v=DKIM1")),
      ...dkim2.filter((r) => r.includes("v=DKIM1")),
    ],
    mx: mxRaw,
  };
}

export class DnsAdapter implements VendorAdapter<DnsDataSources> {
  readonly name = "dns" as const;

  constructor(private readonly dnsConfig: DnsAdapterConfig = {}) {}

  async collect<K extends DnsDataSourceKey & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<DnsDataSources[K]>> {
    if (!ALL_SOURCES.includes(source as DnsDataSourceKey)) {
      throw new AdapterError({
        message: `Unknown DNS data source: ${source}`,
        kind: "permanent",
        vendor: VENDOR_NAME,
        dataSource: source,
        watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      });
    }

    if (!config.dependencies || !("domains" in config.dependencies)) {
      throw new AdapterError({
        message:
          "DNS adapter requires the Graph 'domains' dependency to be " +
          "collected first.  No 'domains' entry found on " +
          "AdapterConfig.dependencies.",
        kind: "permanent",
        vendor: VENDOR_NAME,
        dataSource: source,
        watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      });
    }

    const verifiedDomains = extractVerifiedDomains(config.dependencies);

    const maxConcurrency =
      this.dnsConfig.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const semaphore = getTenantSemaphore(
      VENDOR_NAME,
      config.workspaceId,
      config.tenantId,
      maxConcurrency,
    );

    const collectedAt = new Date().toISOString();
    const results: DomainDnsRecords[] = [];
    let apiCalls = 0;

    // Resolve all domains in parallel, throttled by the tenant semaphore.
    await Promise.all(
      verifiedDomains.map(async (domain) => {
        await semaphore.acquire();
        try {
          const record = await resolveDomain(domain);
          results.push(record);
          apiCalls += 5; // SPF + DMARC + 2x DKIM + MX
        } catch (err) {
          throw new AdapterError({
            message: `DNS resolution failed for domain "${domain}".`,
            kind: "transient",
            vendor: VENDOR_NAME,
            dataSource: source,
            watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
            cause: err,
          });
        } finally {
          semaphore.release();
        }
      }),
    );

    // Sort for deterministic output (parallel resolution finishes in any order).
    results.sort((a, b) => a.domain.localeCompare(b.domain));

    return {
      data: results as unknown as DnsDataSources[K],
      collectedAt,
      apiCallCount: apiCalls,
      missingScopes: [],
    };
  }

  listSources(): readonly (DnsDataSourceKey & string)[] {
    return ALL_SOURCES as readonly (DnsDataSourceKey & string)[];
  }

  requiredScopes(): readonly string[] {
    // DNS lookups need no vendor permissions — they hit the public resolver.
    return [];
  }
}

export function createDnsAdapter(
  dnsConfig: DnsAdapterConfig = {},
): DnsAdapter {
  return new DnsAdapter(dnsConfig);
}
