/**
 * dns-evaluators.test.ts
 *
 * Unit tests for the four DNS-related evaluator modules:
 *   - dmarc-published
 *   - dmarc-reject
 *   - dmarc-cisa-contact
 *   - spf-records-published
 *
 * Each evaluator conforms to `EvaluatorModule { slug, evaluate }` and operates
 * on `snapshot.data?.domainDnsRecords`.  Tests cover slug identity, pass/fail
 * cases, the `.mail.onmicrosoft.com` skip rule, multi-domain scenarios, and
 * edge cases specific to each evaluator's logic.
 */

import { describe, it, expect } from "vitest";

import dmarcPublished from "../../../packages/engine/evaluators/builtin/dmarc-published";
import dmarcReject from "../../../packages/engine/evaluators/builtin/dmarc-reject";
import dmarcCisaContact from "../../../packages/engine/evaluators/builtin/dmarc-cisa-contact";
import spfRecordsPublished from "../../../packages/engine/evaluators/builtin/spf-records-published";

import {
  createSnapshot,
  createEmptySnapshot,
  domainDnsRecord,
} from "../../factories/evidence";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A fully-compliant DMARC record that passes every DNS evaluator. */
const FULL_DMARC =
  "v=DMARC1; p=reject; pct=100; rua=mailto:reports@dmarc.cyber.dhs.gov; ruf=mailto:forensics@example.com";

/** A DMARC record with p=quarantine (passes dmarc-published, fails dmarc-reject). */
const QUARANTINE_DMARC =
  "v=DMARC1; p=quarantine; pct=100; rua=mailto:reports@dmarc.cyber.dhs.gov; ruf=mailto:forensics@example.com";

/** A valid SPF record that passes spf-records-published. */
const VALID_SPF = "v=spf1 include:spf.protection.outlook.com -all";

// ─────────────────────────────────────────────────────────────────────────────
// 1. dmarc-published
// ─────────────────────────────────────────────────────────────────────────────

describe("dmarc-published", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "dmarc-published"', () => {
    expect(dmarcPublished.slug).toBe("dmarc-published");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes with a fully compliant DMARC record (p=reject)", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "acme.com", dmarc: [FULL_DMARC] }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes with p=quarantine (quarantine is acceptable)", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "acme.com", dmarc: [QUARANTINE_DMARC] }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when pct is omitted (defaults to 100 per RFC 7489)", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [
            "v=DMARC1; p=reject; rua=mailto:dmarc@acme.com; ruf=mailto:forensics@acme.com",
          ],
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: empty / missing data ────────────────────────────────────────────

  it("fails with empty domainDnsRecords array", () => {
    const snap = createSnapshot({ domainDnsRecords: [] });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContain(
      "No domain DNS records — re-run Watchtower",
    );
  });

  it("fails with null data (empty snapshot)", () => {
    const snap = createEmptySnapshot();
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContain(
      "No domain DNS records — re-run Watchtower",
    );
  });

  it("fails when domainDnsRecords key is missing", () => {
    const snap = createSnapshot({});
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  // ── fail: no DMARC record on domain ───────────────────────────────────────

  it("fails when domain has no DMARC record", () => {
    const snap = createSnapshot({
      domainDnsRecords: [domainDnsRecord({ domain: "bare.com", dmarc: [] })],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("bare.com");
    expect(result.warnings[0]).toContain("no DMARC record found");
  });

  // ── skip .mail.onmicrosoft.com ────────────────────────────────────────────

  it("skips .mail.onmicrosoft.com domains", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "contoso.mail.onmicrosoft.com",
          dmarc: [], // would fail if not skipped
        }),
      ],
    });
    // All domains were skipped → no failures → pass
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("does NOT skip base onmicrosoft.com domains (only .mail. subdomain)", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "contoso.onmicrosoft.com",
          dmarc: [], // should NOT be skipped
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  // ── multi-domain: mixed pass/fail ─────────────────────────────────────────

  it("warns per-domain when some pass and some fail", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "good.com", dmarc: [FULL_DMARC] }),
        domainDnsRecord({ domain: "bad.com", dmarc: [] }),
        domainDnsRecord({
          domain: "ignore.mail.onmicrosoft.com",
          dmarc: [],
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("bad.com");
  });

  // ── edge: pct < 100 ──────────────────────────────────────────────────────

  it("fails when pct is explicitly less than 100", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [
            "v=DMARC1; p=reject; pct=50; rua=mailto:rua@acme.com; ruf=mailto:ruf@acme.com",
          ],
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("pct=50");
  });

  // ── edge: missing rua ────────────────────────────────────────────────────

  it("fails when rua is missing", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: ["v=DMARC1; p=reject; ruf=mailto:ruf@acme.com"],
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("rua missing");
  });

  // ── edge: missing ruf ────────────────────────────────────────────────────

  it("fails when ruf is missing", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: ["v=DMARC1; p=reject; rua=mailto:rua@acme.com"],
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("ruf missing");
  });

  // ── edge: p=none fails ───────────────────────────────────────────────────

  it("fails when p=none", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [
            "v=DMARC1; p=none; rua=mailto:rua@acme.com; ruf=mailto:ruf@acme.com",
          ],
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("p=none");
  });

  // ── edge: multiple issues aggregated ─────────────────────────────────────

  it("reports multiple issues in a single warning string", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: ["v=DMARC1; p=none; pct=25"],
        }),
      ],
    });
    const result = dmarcPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    const w = result.warnings[0]!;
    expect(w).toContain("p=none");
    expect(w).toContain("pct=25");
    expect(w).toContain("rua missing");
    expect(w).toContain("ruf missing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. dmarc-reject
// ─────────────────────────────────────────────────────────────────────────────

describe("dmarc-reject", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "dmarc-reject"', () => {
    expect(dmarcReject.slug).toBe("dmarc-reject");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when p=reject", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "acme.com", dmarc: [FULL_DMARC] }),
      ],
    });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when p=reject appears anywhere in the record", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [
            "v=DMARC1; rua=mailto:rua@acme.com; p=reject; ruf=mailto:ruf@acme.com",
          ],
        }),
      ],
    });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  // ── fail cases ────────────────────────────────────────────────────────────

  it("fails with empty domainDnsRecords array", () => {
    const snap = createSnapshot({ domainDnsRecords: [] });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContain("No domain DNS records");
  });

  it("fails with empty snapshot (null data)", () => {
    const snap = createEmptySnapshot();
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when p=quarantine (must be reject)", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "acme.com", dmarc: [QUARANTINE_DMARC] }),
      ],
    });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("acme.com");
    expect(result.warnings[0]).toContain("quarantine");
  });

  it("fails when p=none", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: ["v=DMARC1; p=none"],
        }),
      ],
    });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("none");
  });

  it("fails when no DMARC record exists", () => {
    const snap = createSnapshot({
      domainDnsRecords: [domainDnsRecord({ domain: "bare.com", dmarc: [] })],
    });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("bare.com");
    expect(result.warnings[0]).toContain("no DMARC record");
  });

  // ── skip .mail.onmicrosoft.com ────────────────────────────────────────────

  it("skips .mail.onmicrosoft.com domains", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "contoso.mail.onmicrosoft.com",
          dmarc: [],
        }),
      ],
    });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── multi-domain mixed ────────────────────────────────────────────────────

  it("fails for the non-reject domain, passes the rest", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "good.com", dmarc: [FULL_DMARC] }),
        domainDnsRecord({
          domain: "weak.com",
          dmarc: [QUARANTINE_DMARC],
        }),
        domainDnsRecord({
          domain: "skip.mail.onmicrosoft.com",
          dmarc: [],
        }),
      ],
    });
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("weak.com");
  });

  // ── edge: p= tag is case-insensitive ──────────────────────────────────────

  it("passes with uppercase P=REJECT (regex is case-insensitive)", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: ["v=DMARC1; P=REJECT"],
        }),
      ],
    });
    // The regex captures the value, then lowercases it for comparison
    const result = dmarcReject.evaluate(snap);
    expect(result.pass).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. dmarc-cisa-contact
// ─────────────────────────────────────────────────────────────────────────────

describe("dmarc-cisa-contact", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "dmarc-cisa-contact"', () => {
    expect(dmarcCisaContact.slug).toBe("dmarc-cisa-contact");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when CISA email is present in rua", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "acme.com", dmarc: [FULL_DMARC] }),
      ],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when CISA email appears alongside other mailto addresses", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [
            "v=DMARC1; p=reject; rua=mailto:internal@acme.com,mailto:reports@dmarc.cyber.dhs.gov",
          ],
        }),
      ],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  // ── fail cases ────────────────────────────────────────────────────────────

  it("fails with empty domainDnsRecords array", () => {
    const snap = createSnapshot({ domainDnsRecords: [] });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContain("No domain DNS records");
  });

  it("fails with empty snapshot (null data)", () => {
    const snap = createEmptySnapshot();
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when CISA email is absent", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [
            "v=DMARC1; p=reject; rua=mailto:dmarc@acme.com; ruf=mailto:forensics@acme.com",
          ],
        }),
      ],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("acme.com");
    expect(result.warnings[0]).toContain("reports@dmarc.cyber.dhs.gov");
  });

  it("fails when DMARC record is empty string", () => {
    const snap = createSnapshot({
      domainDnsRecords: [domainDnsRecord({ domain: "acme.com", dmarc: [""] })],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when no DMARC record exists on domain", () => {
    const snap = createSnapshot({
      domainDnsRecords: [domainDnsRecord({ domain: "acme.com", dmarc: [] })],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  // ── skip .mail.onmicrosoft.com ────────────────────────────────────────────

  it("skips .mail.onmicrosoft.com domains", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "contoso.mail.onmicrosoft.com",
          dmarc: [],
        }),
      ],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── multi-domain mixed ────────────────────────────────────────────────────

  it("fails for domain missing CISA contact, passes the one with it", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "good.com", dmarc: [FULL_DMARC] }),
        domainDnsRecord({
          domain: "nocisa.com",
          dmarc: ["v=DMARC1; p=reject; rua=mailto:internal@nocisa.com"],
        }),
      ],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("nocisa.com");
  });

  // ── edge: partial email match should not pass ─────────────────────────────

  it("fails when email prefix is modified (xreports instead of reports)", () => {
    // The check is `record.includes("mailto:reports@dmarc.cyber.dhs.gov")`
    // so "mailto:xreports@dmarc.cyber.dhs.gov" does NOT contain the exact
    // substring "mailto:reports@dmarc.cyber.dhs.gov"
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [
            "v=DMARC1; p=reject; rua=mailto:xreports@dmarc.cyber.dhs.gov",
          ],
        }),
      ],
    });
    const result = dmarcCisaContact.evaluate(snap);
    expect(result.pass).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. spf-records-published
// ─────────────────────────────────────────────────────────────────────────────

describe("spf-records-published", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "spf-records-published"', () => {
    expect(spfRecordsPublished.slug).toBe("spf-records-published");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes with a valid SPF include for outlook.com", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "acme.com", spf: [VALID_SPF] }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when the SPF include appears among other mechanisms", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          spf: [
            "v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all",
          ],
        }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("passes when the matching record is the second SPF record", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          spf: [
            "v=spf1 include:other.example.com -all",
            VALID_SPF,
          ],
        }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  // ── fail cases ────────────────────────────────────────────────────────────

  it("fails with empty domainDnsRecords array", () => {
    const snap = createSnapshot({ domainDnsRecords: [] });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContain(
      "No domain DNS records — re-run Watchtower",
    );
  });

  it("fails with empty snapshot (null data)", () => {
    const snap = createEmptySnapshot();
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when no SPF records exist on domain", () => {
    const snap = createSnapshot({
      domainDnsRecords: [domainDnsRecord({ domain: "acme.com", spf: [] })],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("acme.com");
    expect(result.warnings[0]).toContain("spf.protection.outlook.com");
  });

  it("fails when SPF record exists but lacks the outlook include", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          spf: ["v=spf1 include:_spf.google.com -all"],
        }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  // ── skip: SPF does NOT skip .mail.onmicrosoft.com ─────────────────────────
  // Unlike DMARC evaluators, spf-records-published does NOT skip
  // .mail.onmicrosoft.com — it evaluates all domains.

  it("evaluates .mail.onmicrosoft.com domains (no skip rule)", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "contoso.mail.onmicrosoft.com",
          spf: [],
        }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("contoso.mail.onmicrosoft.com");
  });

  // ── multi-domain mixed ────────────────────────────────────────────────────

  it("fails for domain without SPF, passes the one with it", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "good.com", spf: [VALID_SPF] }),
        domainDnsRecord({ domain: "bad.com", spf: [] }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("bad.com");
  });

  it("passes when all domains have valid SPF records", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "alpha.com", spf: [VALID_SPF] }),
        domainDnsRecord({ domain: "beta.com", spf: [VALID_SPF] }),
        domainDnsRecord({ domain: "gamma.com", spf: [VALID_SPF] }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── edge: word-boundary regex behavior ────────────────────────────────────

  it("matches 'spf.protection.outlook.com.evil' due to word-boundary behavior", () => {
    // The regex is /\binclude:spf\.protection\.outlook\.com\b/
    // "spf.protection.outlook.com.evil" — the \b after "com" fails because
    // the next char is '.' which is a non-word char, so \b actually matches.
    // HOWEVER the regex matches on the include: directive as a whole.
    // Let's test the real regex behavior precisely:
    const malicious = "v=spf1 include:spf.protection.outlook.com.evil -all";
    const regex = /\binclude:spf\.protection\.outlook\.com\b/;
    // '.evil' starts with '.', and \b matches between 'm' (word) and '.' (non-word)
    // So the regex DOES match, because the word boundary is satisfied.
    // This is accurate regex behavior — the evaluator matches this.
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({ domain: "acme.com", spf: [malicious] }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    // The regex \b matches before '.' so this DOES pass
    expect(result.pass).toBe(true);
  });

  it("does NOT match a completely different domain", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          spf: ["v=spf1 include:notspf.protection.outlook.com -all"],
        }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    // "include:notspf..." — the \b before "include" requires a word boundary.
    // 'include' is preceded by a space which is non-word, so \b matches.
    // But then the regex looks for "include:spf." and the actual text has
    // "include:notspf." — so the literal match fails.
    expect(result.pass).toBe(false);
  });

  it("does NOT match 'include:xspf.protection.outlook.com'", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          spf: ["v=spf1 include:xspf.protection.outlook.com -all"],
        }),
      ],
    });
    const result = spfRecordsPublished.evaluate(snap);
    expect(result.pass).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cross-evaluator sanity checks
// ─────────────────────────────────────────────────────────────────────────────

describe("cross-evaluator sanity", () => {
  it("all four evaluators have distinct slugs", () => {
    const slugs = [
      dmarcPublished.slug,
      dmarcReject.slug,
      dmarcCisaContact.slug,
      spfRecordsPublished.slug,
    ];
    expect(new Set(slugs).size).toBe(4);
  });

  it("a fully compliant snapshot passes all four evaluators", () => {
    const snap = createSnapshot({
      domainDnsRecords: [
        domainDnsRecord({
          domain: "acme.com",
          dmarc: [FULL_DMARC],
          spf: [VALID_SPF],
        }),
      ],
    });

    expect(dmarcPublished.evaluate(snap).pass).toBe(true);
    expect(dmarcReject.evaluate(snap).pass).toBe(true);
    expect(dmarcCisaContact.evaluate(snap).pass).toBe(true);
    expect(spfRecordsPublished.evaluate(snap).pass).toBe(true);
  });

  it("an empty snapshot fails all four evaluators", () => {
    const snap = createEmptySnapshot();

    expect(dmarcPublished.evaluate(snap).pass).toBe(false);
    expect(dmarcReject.evaluate(snap).pass).toBe(false);
    expect(dmarcCisaContact.evaluate(snap).pass).toBe(false);
    expect(spfRecordsPublished.evaluate(snap).pass).toBe(false);
  });
});
