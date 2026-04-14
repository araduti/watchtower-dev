/**
 * teams-evaluators.test.ts
 *
 * Unit tests for the four Teams-related evaluator modules:
 *   - teams-security-reporting-enabled
 *   - teams-unmanaged-inbound-disabled
 *   - teams-unmanaged-access-disabled
 *   - teams-external-access-restricted
 *
 * Each evaluator conforms to `EvaluatorModule { slug, evaluate }` and operates
 * on Teams-specific evidence sources (teamsMessagingPolicy, threatSubmissionPolicy,
 * teamsExternalAccessPolicy, teamsFederationConfiguration).
 *
 * Tests cover slug identity, pass/fail cases, empty/missing data, precedence
 * logic (federation vs policy), and edge cases specific to each evaluator.
 */

import { describe, it, expect } from "vitest";

import teamsSecurityReporting from "../../../packages/engine/evaluators/builtin/teams-security-reporting-enabled";
import teamsUnmanagedInbound from "../../../packages/engine/evaluators/builtin/teams-unmanaged-inbound-disabled";
import teamsUnmanagedAccess from "../../../packages/engine/evaluators/builtin/teams-unmanaged-access-disabled";
import teamsExternalAccess from "../../../packages/engine/evaluators/builtin/teams-external-access-restricted";
import {
  createSnapshot,
  createEmptySnapshot,
} from "../../factories/evidence";

// ─────────────────────────────────────────────────────────────────────────────
// 1. teams-security-reporting-enabled
// ─────────────────────────────────────────────────────────────────────────────

describe("teams-security-reporting-enabled", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "teams-security-reporting-enabled"', () => {
    expect(teamsSecurityReporting.slug).toBe("teams-security-reporting-enabled");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when allowSecurityEndUserReporting is true and threat submission policy is fully configured", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: true }],
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: true,
          customizedReportRecipientEmailAddress: "security@example.com",
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: empty snapshot ──────────────────────────────────────────────────

  it("fails with warnings when snapshot has no data", () => {
    const snap = createEmptySnapshot();
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("teamsMessagingPolicy"),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("threatSubmissionPolicy"),
    );
  });

  it("fails with warnings when snapshot data is an empty object", () => {
    const snap = createSnapshot({});
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("teamsMessagingPolicy: data not available"),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("threatSubmissionPolicy: policy not configured"),
    );
  });

  // ── fail: non-compliant data ──────────────────────────────────────────────

  it("fails when allowSecurityEndUserReporting is false", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: false }],
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: true,
          customizedReportRecipientEmailAddress: "sec@example.com",
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("allowSecurityEndUserReporting");
    expect(result.warnings[0]).toContain("false");
  });

  it("fails when isReportToCustomizedEmailAddressEnabled is false", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: true }],
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: false,
          customizedReportRecipientEmailAddress: "sec@example.com",
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      "isReportToCustomizedEmailAddressEnabled",
    );
  });

  it("fails when customizedReportRecipientEmailAddress is empty", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: true }],
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: true,
          customizedReportRecipientEmailAddress: "",
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      "customizedReportRecipientEmailAddress",
    );
  });

  it("fails when customizedReportRecipientEmailAddress is undefined", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: true }],
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: true,
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      "customizedReportRecipientEmailAddress",
    );
  });

  // ── independence of the two parts ─────────────────────────────────────────

  it("accumulates warnings from both parts independently", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: false }],
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: false,
          customizedReportRecipientEmailAddress: "",
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    // One from messaging (allowSecurityEndUserReporting), two from threat submission
    expect(result.warnings.length).toBe(3);
  });

  // ── edge: only one data source present ────────────────────────────────────

  it("warns about missing teamsMessagingPolicy but still checks threatSubmissionPolicy", () => {
    const snap = createSnapshot({
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: true,
          customizedReportRecipientEmailAddress: "sec@example.com",
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("teamsMessagingPolicy: data not available");
  });

  it("warns about missing threatSubmissionPolicy but still checks teamsMessagingPolicy", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: true }],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      "threatSubmissionPolicy: policy not configured",
    );
  });

  // ── edge: empty arrays ────────────────────────────────────────────────────

  it("treats empty teamsMessagingPolicy array as missing", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [],
      threatSubmissionPolicy: [
        {
          isReportToCustomizedEmailAddressEnabled: true,
          customizedReportRecipientEmailAddress: "sec@example.com",
        },
      ],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("teamsMessagingPolicy: data not available"),
    );
  });

  it("treats empty threatSubmissionPolicy array as missing", () => {
    const snap = createSnapshot({
      teamsMessagingPolicy: [{ allowSecurityEndUserReporting: true }],
      threatSubmissionPolicy: [],
    });
    const result = teamsSecurityReporting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("threatSubmissionPolicy: policy not configured"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. teams-unmanaged-inbound-disabled
// ─────────────────────────────────────────────────────────────────────────────

describe("teams-unmanaged-inbound-disabled", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "teams-unmanaged-inbound-disabled"', () => {
    expect(teamsUnmanagedInbound.slug).toBe("teams-unmanaged-inbound-disabled");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when federation allowTeamsConsumerInbound is false", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumerInbound: false },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerInbound: true },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when policy enableTeamsConsumerInbound is false (federation absent)", () => {
    const snap = createSnapshot({
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerInbound: false },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when policy enableTeamsConsumerInbound is false and federation allows it", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumerInbound: true },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerInbound: false },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: no data ────────────────────────────────────────────────────────

  it("fails when neither policy nor federation data is available", () => {
    const snap = createEmptySnapshot();
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  it("fails with empty snapshot data object", () => {
    const snap = createSnapshot({});
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  // ── fail: non-compliant ──────────────────────────────────────────────────

  it("fails when both federation and policy allow consumer inbound", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumerInbound: true },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerInbound: true },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("allowTeamsConsumerInbound"),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("enableTeamsConsumerInbound"),
    );
  });

  // ── precedence: federation over policy ────────────────────────────────────

  it("federation takes precedence: passes immediately if federation blocks inbound even if policy allows", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumerInbound: false },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerInbound: true },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── edge: only federation present, non-compliant ──────────────────────────

  it("fails with only federation present and allowTeamsConsumerInbound is true", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumerInbound: true },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("allowTeamsConsumerInbound"),
    );
  });

  // ── edge: only policy present, non-compliant ──────────────────────────────

  it("fails with only policy present and enableTeamsConsumerInbound is true", () => {
    const snap = createSnapshot({
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerInbound: true },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("enableTeamsConsumerInbound"),
    );
  });

  // ── edge: empty arrays ────────────────────────────────────────────────────

  it("treats empty arrays as missing data and fails", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [],
      teamsExternalAccessPolicy: [],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  // ── edge: undefined values ────────────────────────────────────────────────

  it("fails when federation has allowTeamsConsumerInbound as undefined", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumerInbound: undefined },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerInbound: undefined },
      ],
    });
    const result = teamsUnmanagedInbound.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. teams-unmanaged-access-disabled
// ─────────────────────────────────────────────────────────────────────────────

describe("teams-unmanaged-access-disabled", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "teams-unmanaged-access-disabled"', () => {
    expect(teamsUnmanagedAccess.slug).toBe("teams-unmanaged-access-disabled");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when federation allowTeamsConsumer is false", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumer: false },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerAccess: true },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when policy enableTeamsConsumerAccess is false (federation absent)", () => {
    const snap = createSnapshot({
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerAccess: false },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when policy disables access even if federation allows it", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumer: true },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerAccess: false },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: no data ────────────────────────────────────────────────────────

  it("fails when neither policy nor federation data is available", () => {
    const snap = createEmptySnapshot();
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  it("fails with empty snapshot data object", () => {
    const snap = createSnapshot({});
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  // ── fail: non-compliant ──────────────────────────────────────────────────

  it("fails when both federation and policy allow consumer access", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumer: true },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerAccess: true },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("allowTeamsConsumer"),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("enableTeamsConsumerAccess"),
    );
  });

  // ── precedence: federation over policy ────────────────────────────────────

  it("federation takes precedence: passes immediately if federation blocks access even if policy allows", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumer: false },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerAccess: true },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── edge: only federation present, non-compliant ──────────────────────────

  it("fails with only federation present and allowTeamsConsumer is true", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumer: true },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("allowTeamsConsumer"),
    );
  });

  // ── edge: only policy present, non-compliant ──────────────────────────────

  it("fails with only policy present and enableTeamsConsumerAccess is true", () => {
    const snap = createSnapshot({
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerAccess: true },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("enableTeamsConsumerAccess"),
    );
  });

  // ── edge: empty arrays ────────────────────────────────────────────────────

  it("treats empty arrays as missing data and fails", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [],
      teamsExternalAccessPolicy: [],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  // ── edge: undefined values ────────────────────────────────────────────────

  it("fails when federation has allowTeamsConsumer as undefined", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowTeamsConsumer: undefined },
      ],
      teamsExternalAccessPolicy: [
        { enableTeamsConsumerAccess: undefined },
      ],
    });
    const result = teamsUnmanagedAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. teams-external-access-restricted
// ─────────────────────────────────────────────────────────────────────────────

describe("teams-external-access-restricted", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "teams-external-access-restricted"', () => {
    expect(teamsExternalAccess.slug).toBe("teams-external-access-restricted");
  });

  // ── pass condition 1: federation disabled ─────────────────────────────────

  it("passes when federation allowFederatedUsers is false (federation disabled)", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowFederatedUsers: false },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when federation disabled even if policy enables federation access", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowFederatedUsers: false },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── pass condition 2: federation enabled with real allowlist ──────────────

  it("passes when federation enabled with a concrete domain allowlist", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: ["partner.com", "vendor.org"],
        },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when allowedDomains is a non-empty object (not AllowAllKnownDomains)", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: { AllowedDomain: ["contoso.com"] },
        },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── pass condition 3: policy disables federation access ───────────────────

  it("passes when policy enableFederationAccess is false", () => {
    const snap = createSnapshot({
      teamsExternalAccessPolicy: [
        { enableFederationAccess: false },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when policy disables federation even if federation config allows all", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: {},
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: false },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: no data ────────────────────────────────────────────────────────

  it("fails when neither policy nor federation data is available", () => {
    const snap = createEmptySnapshot();
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  it("fails with empty snapshot data object", () => {
    const snap = createSnapshot({});
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  // ── fail: AllowAllKnownDomains variants ───────────────────────────────────

  it("fails when allowedDomains is undefined (AllowAllKnownDomains default)", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: undefined,
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("AllowAllKnownDomains"),
    );
  });

  it("fails when allowedDomains is an empty object (AllowAllKnownDomains)", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: {},
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("AllowAllKnownDomains"),
    );
  });

  it("fails when allowedDomains JSON contains AllowAllKnownDomains string", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: { AllowAllKnownDomains: true },
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("AllowAllKnownDomains"),
    );
  });

  it('fails when allowedDomains is the literal string "AllowAllKnownDomains"', () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: "AllowAllKnownDomains",
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("AllowAllKnownDomains"),
    );
  });

  // ── fail: non-compliant all around ────────────────────────────────────────

  it("fails when federation allows all users and policy enables federation access", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: {},
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings.length).toBe(2);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("allowFederatedUsers"),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("enableFederationAccess"),
    );
  });

  // ── precedence: federation conditions checked before policy ───────────────

  it("federation disable takes precedence over policy (pass condition 1 first)", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowFederatedUsers: false },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("federation allowlist takes precedence over policy check (pass condition 2 before 3)", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: ["trusted.com"],
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── edge: only policy present ─────────────────────────────────────────────

  it("passes with only policy data when enableFederationAccess is false", () => {
    const snap = createSnapshot({
      teamsExternalAccessPolicy: [
        { enableFederationAccess: false },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails with only policy data when enableFederationAccess is true", () => {
    const snap = createSnapshot({
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("enableFederationAccess"),
    );
  });

  // ── edge: only federation present, non-compliant ──────────────────────────

  it("fails with only federation when allowing all federated users with AllowAll", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: {},
        },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("allowFederatedUsers"),
    );
  });

  // ── edge: empty arrays ────────────────────────────────────────────────────

  it("treats empty arrays as missing data and fails", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [],
      teamsExternalAccessPolicy: [],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Teams connector data not available"),
    );
  });

  // ── edge: allowFederatedUsers undefined with federation present ────────────

  it("does not trigger pass condition 1 or 2 when allowFederatedUsers is undefined", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        { allowFederatedUsers: undefined },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  // ── edge: allowedDomains is an array containing AllowAllKnownDomains ──────

  it("fails when allowedDomains array contains AllowAllKnownDomains string", () => {
    const snap = createSnapshot({
      teamsFederationConfiguration: [
        {
          allowFederatedUsers: true,
          allowedDomains: ["AllowAllKnownDomains"],
        },
      ],
      teamsExternalAccessPolicy: [
        { enableFederationAccess: true },
      ],
    });
    const result = teamsExternalAccess.evaluate(snap);
    expect(result.pass).toBe(false);
  });
});
