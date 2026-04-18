import { resolveTxt } from "node:dns/promises";

import type { AdapterConfig, AdapterResult, VendorAdapter } from "./types.ts";

export interface DnsRecordSummary {
  readonly domain: string;
  readonly spf: readonly string[];
  readonly dmarc: readonly string[];
  readonly dkim: readonly string[];
}

export interface DnsDataSources {
  domainDnsRecords: DnsRecordSummary[];
}

type DnsSource = keyof DnsDataSources;

export interface DnsAdapterConfig {
  readonly verifiedDomains: readonly string[];
}

async function lookupTxt(name: string): Promise<string[]> {
  try {
    const records = await resolveTxt(name);
    return records.map((entry) => entry.join(""));
  } catch {
    return [];
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
          lookupTxt(domain),
          lookupTxt(`_dmarc.${domain}`),
          lookupTxt(`selector1._domainkey.${domain}`),
          lookupTxt(`selector2._domainkey.${domain}`),
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
