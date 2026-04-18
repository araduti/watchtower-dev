import { resolveTxt } from "node:dns/promises";

import { AdapterError } from "./adapter-error.ts";
import type { AdapterConfig, AdapterResult, VendorAdapter } from "./types.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

export interface DnsRecordSummary {
  readonly domain: string;
  readonly spf: readonly string[];
  readonly dmarc: readonly string[];
  readonly dkim: readonly string[];
}

export interface DnsDataSources {
  readonly [key: string]: unknown;
  domainDnsRecords: DnsRecordSummary[];
}

type DnsSource = keyof DnsDataSources & string;

export interface DnsAdapterConfig {
  readonly verifiedDomains: readonly string[];
}

const VENDOR_NAME = "dns" as const;
const EMPTY_RECORD_CODES = new Set(["ENODATA", "ENOTFOUND", "ENONAME", "NXDOMAIN"]);
const TRANSIENT_CODES = new Set(["EAI_AGAIN", "ETIMEOUT", "ESERVFAIL", "ECONNREFUSED"]);

async function lookupTxt(name: string, source: string): Promise<string[]> {
  try {
    const records = await resolveTxt(name);
    return records.map((entry) => entry.join(""));
  } catch (cause) {
    const code = cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: unknown }).code ?? "")
      : "";

    if (EMPTY_RECORD_CODES.has(code)) {
      return [];
    }

    throw new AdapterError({
      message: `DNS lookup failed for ${name}.`,
      kind: TRANSIENT_CODES.has(code) ? "transient" : "permanent",
      vendor: VENDOR_NAME,
      dataSource: source,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      cause,
    });
  }
}

export class DnsAdapter implements VendorAdapter<DnsDataSources> {
  readonly name = "dns" as const;

  constructor(private readonly dnsConfig: DnsAdapterConfig) {}

  async collect<K extends DnsSource>(
    source: K,
    _config: AdapterConfig,
  ): Promise<AdapterResult<DnsDataSources[K]>> {
    if (source !== "domainDnsRecords") {
      return {
        data: [] as DnsDataSources[K],
        collectedAt: new Date().toISOString(),
        apiCallCount: 0,
        missingScopes: [],
      };
    }

    const records = await Promise.all(
      this.dnsConfig.verifiedDomains.map(async (domain) => {
        const [spf, dmarc, dkimSelector1, dkimSelector2] = await Promise.all([
          lookupTxt(domain, source),
          lookupTxt(`_dmarc.${domain}`, source),
          lookupTxt(`selector1._domainkey.${domain}`, source),
          lookupTxt(`selector2._domainkey.${domain}`, source),
        ]);

        return {
          domain,
          spf: spf.filter((value) => value.startsWith("v=spf1")),
          dmarc: dmarc.filter((value) => value.startsWith("v=DMARC1")),
          dkim: [
            ...dkimSelector1.filter((value) => value.includes("v=DKIM1")),
            ...dkimSelector2.filter((value) => value.includes("v=DKIM1")),
          ],
        } as const;
      }),
    );

    return {
      data: records as DnsDataSources[K],
      collectedAt: new Date().toISOString(),
      apiCallCount: records.length,
      missingScopes: [],
    };
  }

  listSources(): readonly DnsSource[] {
    return ["domainDnsRecords"];
  }

  requiredScopes<K extends DnsSource>(_source: K): readonly string[] {
    return [];
  }
}

export function createDnsAdapter(config: DnsAdapterConfig): DnsAdapter {
  return new DnsAdapter(config);
}
