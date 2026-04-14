import { resolveTxt } from "node:dns/promises";

const domains: string[] = JSON.parse(Bun.argv[2] ?? "[]");
const outPath: string = Bun.argv[3] ?? "/tmp/watchtower-dns.json";

if (domains.length === 0) {
  await Bun.write(outPath, JSON.stringify([]));
  process.exit(0);
}

async function lookupTxt(name: string): Promise<string[]> {
  try {
    const results = await resolveTxt(name);
    return results.map(r => r.join(""));
  } catch {
    return [];
  }
}

const results = await Promise.all(
  domains.map(async (domain) => {
    const [spf, dmarc, dkimSelector1, dkimSelector2] = await Promise.all([
      lookupTxt(domain),
      lookupTxt(`_dmarc.${domain}`),
      lookupTxt(`selector1._domainkey.${domain}`),
      lookupTxt(`selector2._domainkey.${domain}`),
    ]);

    return {
      domain,
      spf:   spf.filter(r => r.startsWith("v=spf1")),
      dmarc: dmarc.filter(r => r.startsWith("v=DMARC1")),
      dkim:  [
        ...dkimSelector1.filter(r => r.includes("v=DKIM1")),
        ...dkimSelector2.filter(r => r.includes("v=DKIM1")),
      ],
    };
  })
);

await Bun.write(outPath, JSON.stringify(results, null, 2));