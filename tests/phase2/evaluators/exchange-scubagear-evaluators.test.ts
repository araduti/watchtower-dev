/**
 * exchange-scubagear-evaluators.test.ts
 *
 * Unit tests for the Exchange / transport evaluator modules and ScubaGear stubs:
 *
 *   Exchange / transport evaluators:
 *   - no-domain-whitelisting-transport-rules
 *   - no-external-forwarding-transport-rules
 *   - calendar-sharing-restricted
 *
 *   ScubaGear evaluators:
 *   - user-consent-restricted
 *   - preset-policies-enabled
 *
 *   ScubaGear stubs (10):
 *   - blockLegacyAuth, blockHighRiskUsers, blockHighRiskSignIns,
 *     requireMFAAllUsers, phishingResistantMFAAdmins,
 *     noPermanentActiveAssignment, globalAdminApprovalRequired,
 *     assignmentAlertConfigured, globalAdminActivationAlert,
 *     externalAccessPerDomain
 *
 * Each evaluator conforms to `EvaluatorModule { slug, evaluate }` and operates
 * on Exchange-specific evidence sources (transportRules, sharingPolicies,
 * authorizationPolicy, atpProtectionPolicyRules).
 *
 * Tests cover slug identity, pass/fail cases, empty/missing data, non-compliant
 * data, and edge cases specific to each evaluator.
 */

import { describe, it, expect } from "vitest";

import noDomainWhitelisting from "../../../packages/engine/evaluators/builtin/no-domain-whitelisting-transport-rules";
import noExternalForwarding from "../../../packages/engine/evaluators/builtin/no-external-forwarding-transport-rules";
import calendarSharingRestricted from "../../../packages/engine/evaluators/builtin/calendar-sharing-restricted";
import userConsentRestricted from "../../../packages/engine/evaluators/builtin/user-consent-restricted";
import presetPoliciesEnabled from "../../../packages/engine/evaluators/builtin/preset-policies-enabled";
import scubagearStubs from "../../../packages/engine/evaluators/builtin/scubagear-stubs";
import { createSnapshot, createEmptySnapshot } from "../../factories/evidence";

// ─────────────────────────────────────────────────────────────────────────────
// 1. no-domain-whitelisting-transport-rules
// ─────────────────────────────────────────────────────────────────────────────

describe("no-domain-whitelisting-transport-rules", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "no-domain-whitelisting-transport-rules"', () => {
    expect(noDomainWhitelisting.slug).toBe(
      "no-domain-whitelisting-transport-rules",
    );
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when no transport rules exist", () => {
    const snap = createSnapshot({ transportRules: [] });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when transport rules have no SCL=-1 whitelisting", () => {
    const snap = createSnapshot({
      transportRules: [
        { name: "Safe Rule", setScl: 0, senderDomainIs: ["example.com"] },
        { name: "Block Rule", setScl: 5, senderDomainIs: ["spam.com"] },
      ],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when SCL=-1 but senderDomainIs is empty", () => {
    const snap = createSnapshot({
      transportRules: [{ name: "No Domains", setScl: -1, senderDomainIs: [] }],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when SCL=-1 but senderDomainIs is not an array", () => {
    const snap = createSnapshot({
      transportRules: [
        { name: "String Domain", setScl: -1, senderDomainIs: "example.com" },
      ],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when SCL=-1 but senderDomainIs is undefined", () => {
    const snap = createSnapshot({
      transportRules: [{ name: "No Sender Domain", setScl: -1 }],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: empty / missing data ────────────────────────────────────────────

  it("passes with empty snapshot (no transportRules key defaults to empty array)", () => {
    const snap = createEmptySnapshot();
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes with snapshot data as empty object", () => {
    const snap = createSnapshot({});
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: non-compliant data ──────────────────────────────────────────────

  it("fails when a rule has SCL=-1 and non-empty senderDomainIs", () => {
    const snap = createSnapshot({
      transportRules: [
        {
          name: "Whitelist Partner",
          setScl: -1,
          senderDomainIs: ["partner.com"],
        },
      ],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Whitelist Partner");
    expect(result.warnings[0]).toContain("SCL=-1");
    expect(result.warnings[0]).toContain("partner.com");
  });

  it("fails with multiple offending rules and reports each one", () => {
    const snap = createSnapshot({
      transportRules: [
        {
          name: "Rule A",
          setScl: -1,
          senderDomainIs: ["alpha.com", "beta.com"],
        },
        { name: "Safe Rule", setScl: 0, senderDomainIs: ["gamma.com"] },
        { name: "Rule B", setScl: -1, senderDomainIs: ["delta.com"] },
      ],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("Rule A");
    expect(result.warnings[0]).toContain("alpha.com");
    expect(result.warnings[0]).toContain("beta.com");
    expect(result.warnings[1]).toContain("Rule B");
    expect(result.warnings[1]).toContain("delta.com");
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it("distinguishes SCL=-1 from other negative SCL values", () => {
    const snap = createSnapshot({
      transportRules: [
        {
          name: "Not Minus One",
          setScl: -2,
          senderDomainIs: ["example.com"],
        },
      ],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("correctly joins multiple domains in the warning message", () => {
    const snap = createSnapshot({
      transportRules: [
        {
          name: "Multi Domain",
          setScl: -1,
          senderDomainIs: ["a.com", "b.com", "c.com"],
        },
      ],
    });
    const result = noDomainWhitelisting.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("a.com, b.com, c.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. no-external-forwarding-transport-rules
// ─────────────────────────────────────────────────────────────────────────────

describe("no-external-forwarding-transport-rules", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "no-external-forwarding-transport-rules"', () => {
    expect(noExternalForwarding.slug).toBe(
      "no-external-forwarding-transport-rules",
    );
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when no transport rules exist", () => {
    const snap = createSnapshot({ transportRules: [] });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when rules have no redirectMessageTo", () => {
    const snap = createSnapshot({
      transportRules: [
        { name: "Normal Rule", redirectMessageTo: [] },
        { name: "Another Rule" },
      ],
    });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when redirectMessageTo is undefined on all rules", () => {
    const snap = createSnapshot({
      transportRules: [
        { name: "Rule 1" },
        { name: "Rule 2" },
      ],
    });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: empty / missing data ────────────────────────────────────────────

  it("passes with empty snapshot (defaults to no rules)", () => {
    const snap = createEmptySnapshot();
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes with snapshot data as empty object", () => {
    const snap = createSnapshot({});
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: non-compliant data ──────────────────────────────────────────────

  it("fails when a rule redirects to external addresses", () => {
    const snap = createSnapshot({
      transportRules: [
        {
          name: "Forward to Partner",
          redirectMessageTo: ["partner@external.com"],
        },
      ],
    });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Forward to Partner");
    expect(result.warnings[0]).toContain("redirects to");
    expect(result.warnings[0]).toContain("partner@external.com");
  });

  it("fails with multiple redirect rules and reports each one", () => {
    const snap = createSnapshot({
      transportRules: [
        {
          name: "Rule A",
          redirectMessageTo: ["a@external.com", "b@external.com"],
        },
        { name: "Safe Rule", redirectMessageTo: [] },
        { name: "Rule B", redirectMessageTo: ["c@external.com"] },
      ],
    });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("Rule A");
    expect(result.warnings[0]).toContain("a@external.com");
    expect(result.warnings[0]).toContain("b@external.com");
    expect(result.warnings[1]).toContain("Rule B");
    expect(result.warnings[1]).toContain("c@external.com");
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it("treats an empty redirectMessageTo array as compliant", () => {
    const snap = createSnapshot({
      transportRules: [{ name: "Empty Redirect", redirectMessageTo: [] }],
    });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("correctly joins multiple redirect addresses in the warning", () => {
    const snap = createSnapshot({
      transportRules: [
        {
          name: "Multi Redirect",
          redirectMessageTo: ["x@test.com", "y@test.com", "z@test.com"],
        },
      ],
    });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("x@test.com, y@test.com, z@test.com");
  });

  it("only flags rules that have a non-empty redirectMessageTo", () => {
    const snap = createSnapshot({
      transportRules: [
        { name: "Safe 1", redirectMessageTo: [] },
        { name: "Safe 2" },
        { name: "Bad Rule", redirectMessageTo: ["attacker@evil.com"] },
      ],
    });
    const result = noExternalForwarding.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Bad Rule");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. calendar-sharing-restricted
// ─────────────────────────────────────────────────────────────────────────────

describe("calendar-sharing-restricted", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "calendar-sharing-restricted"', () => {
    expect(calendarSharingRestricted.slug).toBe("calendar-sharing-restricted");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when sharing policies have no wildcard domain entries", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          name: "Default Sharing Policy",
          identity: "Default Sharing Policy",
          domains: ["partner.com:CalendarSharingFreeBusySimple"],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when wildcard domain does not include CalendarSharingFreeBusyDetail", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          name: "Limited Sharing",
          identity: "Limited Sharing",
          domains: ["*:CalendarSharingFreeBusySimple"],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when domains array is empty", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        { name: "No Domains", identity: "No Domains", domains: [] },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: empty / missing data ────────────────────────────────────────────

  it("fails when snapshot has no data", () => {
    const snap = createEmptySnapshot();
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No sharing policies");
  });

  it("fails when snapshot data is an empty object", () => {
    const snap = createSnapshot({});
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("No sharing policies");
  });

  it("fails when sharingPolicies is an empty array", () => {
    const snap = createSnapshot({ sharingPolicies: [] });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No sharing policies");
  });

  // ── fail: non-compliant data ──────────────────────────────────────────────

  it("fails when a policy shares calendar details with all domains via wildcard", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          name: "Oversharing Policy",
          identity: "Oversharing Policy",
          domains: ["*:CalendarSharingFreeBusyDetail"],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Oversharing Policy");
    expect(result.warnings[0]).toContain("shares calendar details");
  });

  it("fails for case-insensitive match on CalendarSharingFreeBusyDetail", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          name: "Mixed Case",
          identity: "Mixed Case",
          domains: ["*:CALENDARSHARINGFREEBUSYDETAIL"],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Mixed Case");
  });

  it("fails with multiple non-compliant policies", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          name: "Policy A",
          identity: "Policy A",
          domains: ["*:CalendarSharingFreeBusyDetail"],
        },
        {
          name: "Policy B",
          identity: "Policy B",
          domains: [
            "partner.com:CalendarSharingFreeBusySimple",
            "*:CalendarSharingFreeBusyDetail",
          ],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("Policy A");
    expect(result.warnings[1]).toContain("Policy B");
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it("does not flag a specific domain (not wildcard) sharing calendar details", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          name: "Specific Domain",
          identity: "Specific Domain",
          domains: ["partner.com:CalendarSharingFreeBusyDetail"],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("uses name if available, falls back to identity in warnings", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          identity: "FallbackIdentity",
          domains: ["*:CalendarSharingFreeBusyDetail"],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("FallbackIdentity");
  });

  it("handles policies with undefined domains gracefully", () => {
    const snap = createSnapshot({
      sharingPolicies: [{ name: "No Domains Policy", identity: "NDP" }],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("matches domain string containing CalendarSharingFreeBusyDetail as a substring", () => {
    const snap = createSnapshot({
      sharingPolicies: [
        {
          name: "Substring Match",
          identity: "Substring Match",
          domains: [
            "*:CalendarSharingFreeBusyReview,CalendarSharingFreeBusyDetail",
          ],
        },
      ],
    });
    const result = calendarSharingRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. user-consent-restricted
// ─────────────────────────────────────────────────────────────────────────────

describe("user-consent-restricted", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "user-consent-restricted"', () => {
    expect(userConsentRestricted.slug).toBe("user-consent-restricted");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when authorization policy has no broad consent strings", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "managepermissiongrantsforself.microsoft-user-default-recommended",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when permissionGrantPolicyIdsAssignedToDefaultUserRole is empty", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when permissionGrantPolicyIdsAssignedToDefaultUserRole is undefined", () => {
    const snap = createSnapshot({
      authorizationPolicy: [{}],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: empty / missing data ────────────────────────────────────────────

  it("fails when snapshot has no data", () => {
    const snap = createEmptySnapshot();
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No authorization policy");
  });

  it("fails when snapshot data is an empty object", () => {
    const snap = createSnapshot({});
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("No authorization policy");
  });

  it("fails when authorizationPolicy is an empty array", () => {
    const snap = createSnapshot({ authorizationPolicy: [] });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No authorization policy");
  });

  // ── fail: non-compliant data ──────────────────────────────────────────────

  it("fails when default-low consent policy is assigned", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "ManagePermissionGrantsForSelf.microsoft-user-default-low",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("User consent enabled via");
    expect(result.warnings[0]).toContain("microsoft-user-default-low");
  });

  it("fails when default-legacy consent policy is assigned", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "ManagePermissionGrantsForSelf.microsoft-user-default-legacy",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("User consent enabled via");
    expect(result.warnings[0]).toContain("microsoft-user-default-legacy");
  });

  it("fails when both broad consent policies are assigned", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "ManagePermissionGrantsForSelf.microsoft-user-default-low",
            "ManagePermissionGrantsForSelf.microsoft-user-default-legacy",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("User consent enabled via");
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it("uses case-insensitive comparison for policy strings", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "MANAGEPERMISSIONGRANTSFORSELF.MICROSOFT-USER-DEFAULT-LOW",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });

  it("does not flag unrelated permission grant policies", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "managepermissiongrantsforself.microsoft-user-default-recommended",
            "microsoft-application-admin",
            "some-other-policy",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("only reads the first policy object in the array", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [],
        },
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "ManagePermissionGrantsForSelf.microsoft-user-default-low",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    // Only first policy is checked, so this should pass
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("matches broad consent strings as substrings (includes check)", () => {
    const snap = createSnapshot({
      authorizationPolicy: [
        {
          permissionGrantPolicyIdsAssignedToDefaultUserRole: [
            "prefix-managepermissiongrantsforself.microsoft-user-default-low-suffix",
          ],
        },
      ],
    });
    const result = userConsentRestricted.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. preset-policies-enabled
// ─────────────────────────────────────────────────────────────────────────────

describe("preset-policies-enabled", () => {
  // ── slug ──────────────────────────────────────────────────────────────────

  it('has slug "preset-policies-enabled"', () => {
    expect(presetPoliciesEnabled.slug).toBe("preset-policies-enabled");
  });

  // ── pass cases ────────────────────────────────────────────────────────────

  it("passes when both Standard and Strict preset policies exist", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [
        { identity: "Standard Preset Security Policy" },
        { identity: "Strict Preset Security Policy" },
      ],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes with case-insensitive identity matching", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [
        { identity: "STANDARD preset security policy" },
        { identity: "strict PRESET Security Policy" },
      ],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── fail: empty / missing data ────────────────────────────────────────────

  it("fails when snapshot has no data", () => {
    const snap = createEmptySnapshot();
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No ATP protection policy rules");
  });

  it("fails when snapshot data is an empty object", () => {
    const snap = createSnapshot({});
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("No ATP protection policy rules");
  });

  it("fails when atpProtectionPolicyRules is an empty array", () => {
    const snap = createSnapshot({ atpProtectionPolicyRules: [] });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No ATP protection policy rules");
  });

  // ── fail: non-compliant data ──────────────────────────────────────────────

  it("fails when only Standard policy is present (missing Strict)", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [
        { identity: "Standard Preset Security Policy" },
      ],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Strict");
    expect(result.warnings[0]).toContain("not found or disabled");
  });

  it("fails when only Strict policy is present (missing Standard)", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [
        { identity: "Strict Preset Security Policy" },
      ],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Standard");
    expect(result.warnings[0]).toContain("not found or disabled");
  });

  it("fails with two warnings when neither Standard nor Strict is present", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [
        { identity: "Custom Policy" },
        { identity: "Another Policy" },
      ],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("Standard");
    expect(result.warnings[1]).toContain("Strict");
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it("matches identity containing 'standard' or 'strict' as a substring", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [
        { identity: "My Standard Policy Override" },
        { identity: "Org Strict Enforcement" },
      ],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("handles rules with undefined identity gracefully", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [
        {},
        { identity: "Standard Preset Security Policy" },
        { identity: "Strict Preset Security Policy" },
      ],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("does not pass when identity is null", () => {
    const snap = createSnapshot({
      atpProtectionPolicyRules: [{ identity: null }],
    });
    const result = presetPoliciesEnabled.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ScubaGear stubs
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_STUB_SLUGS = [
  "blockLegacyAuth",
  "blockHighRiskUsers",
  "blockHighRiskSignIns",
  "requireMFAAllUsers",
  "phishingResistantMFAAdmins",
  "noPermanentActiveAssignment",
  "globalAdminApprovalRequired",
  "assignmentAlertConfigured",
  "globalAdminActivationAlert",
  "externalAccessPerDomain",
] as const;

describe("scubagear-stubs", () => {
  // ── array structure ───────────────────────────────────────────────────────

  it("exports an array of exactly 10 evaluator modules", () => {
    expect(Array.isArray(scubagearStubs)).toBe(true);
    expect(scubagearStubs).toHaveLength(10);
  });

  it("contains all expected stub slugs", () => {
    const slugs = scubagearStubs.map((s) => s.slug);
    for (const expected of EXPECTED_STUB_SLUGS) {
      expect(slugs).toContain(expected);
    }
  });

  it("has no duplicate slugs", () => {
    const slugs = scubagearStubs.map((s) => s.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  // ── per-stub tests ────────────────────────────────────────────────────────

  for (const expectedSlug of EXPECTED_STUB_SLUGS) {
    describe(`stub: ${expectedSlug}`, () => {
      it(`has slug "${expectedSlug}"`, () => {
        const stub = scubagearStubs.find((s) => s.slug === expectedSlug);
        expect(stub).toBeDefined();
        expect(stub!.slug).toBe(expectedSlug);
      });

      it("returns pass=false with 'not yet implemented' warning", () => {
        const stub = scubagearStubs.find((s) => s.slug === expectedSlug)!;
        const snap = createSnapshot({});
        const result = stub.evaluate(snap);
        expect(result.pass).toBe(false);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("not yet implemented");
        expect(result.warnings[0]).toContain(expectedSlug);
      });

      it("returns pass=false with an empty snapshot", () => {
        const stub = scubagearStubs.find((s) => s.slug === expectedSlug)!;
        const snap = createEmptySnapshot();
        const result = stub.evaluate(snap);
        expect(result.pass).toBe(false);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("not yet implemented");
      });

      it("returns pass=false with a populated snapshot (ignores data)", () => {
        const stub = scubagearStubs.find((s) => s.slug === expectedSlug)!;
        const snap = createSnapshot({
          transportRules: [{ name: "Anything", setScl: -1 }],
          sharingPolicies: [{ name: "Any Policy", domains: [] }],
          authorizationPolicy: [
            { permissionGrantPolicyIdsAssignedToDefaultUserRole: [] },
          ],
          atpProtectionPolicyRules: [
            { identity: "Standard Preset Security Policy" },
          ],
        });
        const result = stub.evaluate(snap);
        expect(result.pass).toBe(false);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toBe(
          `ScubaGear evaluator "${expectedSlug}" not yet implemented`,
        );
      });
    });
  }

  // ── each stub has an evaluate function ────────────────────────────────────

  it("every stub has a callable evaluate function", () => {
    for (const stub of scubagearStubs) {
      expect(typeof stub.evaluate).toBe("function");
    }
  });

  // ── stub warning message format ───────────────────────────────────────────

  it("each stub warning follows the exact expected format", () => {
    for (const stub of scubagearStubs) {
      const result = stub.evaluate(createSnapshot({}));
      expect(result.warnings[0]).toBe(
        `ScubaGear evaluator "${stub.slug}" not yet implemented`,
      );
    }
  });
});
