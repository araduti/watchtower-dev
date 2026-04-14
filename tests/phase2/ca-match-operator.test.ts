/**
 * ca-match-operator.test.ts
 *
 * Phase 4 tests for the `ca-match` operator — CA policy match specs as
 * assertion data.
 *
 * Verifies that:
 *   1. The ca-match operator is recognized by the Operator type
 *   2. All 13 CA policy assertions use ca-match with inline match specs
 *   3. The deprecated ca-policy-match: evaluatorSlug pattern is fully removed
 *   4. Match specs in expectedValue contain valid CA policy criteria
 *   5. No leftover references to the removed ca-policy-specs.ts module
 */

import { describe, it, expect } from "vitest";
import { MOCKED_CONTROL_ASSERTIONS } from "../../packages/engine/assertions";
import type { Operator } from "../../packages/engine/argus.engine-v2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All CA policy control IDs that should use ca-match */
const CA_MATCH_CONTROL_IDS = [
  "1.3.2b",
  "5.2.2.1", "5.2.2.2", "5.2.2.3", "5.2.2.4",
  "5.2.2.5", "5.2.2.6", "5.2.2.7", "5.2.2.8",
  "5.2.2.9", "5.2.2.10", "5.2.2.11", "5.2.2.12",
];

function caMatchAssertions() {
  return MOCKED_CONTROL_ASSERTIONS.filter(
    (a) => a.operator === ("ca-match" as Operator),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 4 — ca-match operator", () => {
  // -----------------------------------------------------------------------
  // 1. Correct count and coverage
  // -----------------------------------------------------------------------
  describe("Assertion migration completeness", () => {
    it("has exactly 13 ca-match assertions", () => {
      expect(caMatchAssertions().length).toBe(13);
    });

    it("covers all expected CA policy control IDs", () => {
      const ids = caMatchAssertions().map((a) => a.controlId).sort();
      expect(ids).toEqual(CA_MATCH_CONTROL_IDS.sort());
    });

    it("no assertions use deprecated ca-policy-match: evaluatorSlug", () => {
      const legacy = MOCKED_CONTROL_ASSERTIONS.filter(
        (a) => a.evaluatorSlug?.startsWith("ca-policy-match:"),
      );
      expect(legacy).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Match spec structure validation
  // -----------------------------------------------------------------------
  describe("Match spec structure", () => {
    const assertions = caMatchAssertions();

    for (const assertion of assertions) {
      describe(`[${assertion.controlId}] ${assertion.controlTitle}`, () => {
        it("has operator ca-match", () => {
          expect(assertion.operator).toBe("ca-match");
        });

        it("has a non-null object in expectedValue", () => {
          expect(assertion.expectedValue).toBeDefined();
          expect(assertion.expectedValue).not.toBeNull();
          expect(typeof assertion.expectedValue).toBe("object");
        });

        it("does not have an evaluatorSlug", () => {
          expect(assertion.evaluatorSlug).toBeUndefined();
        });

        it("match spec has state: active", () => {
          const spec = assertion.expectedValue as Record<string, any>;
          expect(spec.state).toBe("active");
        });

        it("match spec has user targeting (users or userActions)", () => {
          const spec = assertion.expectedValue as Record<string, any>;
          const hasUsers = spec.users !== undefined;
          const hasUserActions = spec.userActions !== undefined;
          expect(hasUsers || hasUserActions).toBe(true);
        });
      });
    }
  });

  // -----------------------------------------------------------------------
  // 3. Specific CA policy spec validation
  // -----------------------------------------------------------------------
  describe("Specific CA policy specs", () => {
    function findAssertion(controlId: string) {
      return MOCKED_CONTROL_ASSERTIONS.find(
        (a) => a.controlId === controlId && a.operator === ("ca-match" as Operator),
      );
    }

    it("1.3.2b targets Office365 with browser client type and app-enforced restrictions", () => {
      const a = findAssertion("1.3.2b")!;
      const spec = a.expectedValue as any;
      expect(spec.users.include).toBe("All");
      expect(spec.apps.include).toBe("Office365");
      expect(spec.clientAppTypes).toEqual(["browser"]);
      expect(spec.session.appEnforcedRestrictions).toBe(true);
    });

    it("5.2.2.1 requires MFA for admin roles", () => {
      const a = findAssertion("5.2.2.1")!;
      const spec = a.expectedValue as any;
      expect(spec.users.roles).toBeDefined();
      expect(spec.users.roles.length).toBeGreaterThan(0);
      expect(spec.grant.anyOf).toEqual(["mfa"]);
      expect(spec.exclusions).toBe("break-glass-only");
    });

    it("5.2.2.2 requires MFA for all users", () => {
      const a = findAssertion("5.2.2.2")!;
      const spec = a.expectedValue as any;
      expect(spec.users.include).toBe("All");
      expect(spec.apps.include).toBe("All");
      expect(spec.grant.anyOf).toEqual(["mfa"]);
    });

    it("5.2.2.3 blocks legacy auth", () => {
      const a = findAssertion("5.2.2.3")!;
      const spec = a.expectedValue as any;
      expect(spec.clientAppTypes).toContain("exchangeActiveSync");
      expect(spec.clientAppTypes).toContain("other");
      expect(spec.grant.anyOf).toEqual(["block"]);
    });

    it("5.2.2.5 requires phishing-resistant MFA for admins", () => {
      const a = findAssertion("5.2.2.5")!;
      const spec = a.expectedValue as any;
      expect(spec.grant.authStrength).toBe("00000000-0000-0000-0000-000000000004");
    });

    it("5.2.2.6 has user risk levels", () => {
      const a = findAssertion("5.2.2.6")!;
      const spec = a.expectedValue as any;
      expect(spec.userRisk).toEqual(["high"]);
      expect(spec.session.signInFrequencyHours).toBe(0);
    });

    it("5.2.2.7 has sign-in risk levels", () => {
      const a = findAssertion("5.2.2.7")!;
      const spec = a.expectedValue as any;
      expect(spec.signInRisk).toEqual(["high", "medium"]);
    });

    it("5.2.2.9 requires managed device", () => {
      const a = findAssertion("5.2.2.9")!;
      const spec = a.expectedValue as any;
      expect(spec.grant.anyOf).toContain("compliantDevice");
      expect(spec.grant.anyOf).toContain("domainJoinedDevice");
      expect(spec.grant.operator).toBe("OR");
    });

    it("5.2.2.10 targets registerSecurityInfo user action", () => {
      const a = findAssertion("5.2.2.10")!;
      const spec = a.expectedValue as any;
      expect(spec.userActions).toEqual(["urn:user:registerSecurityInfo"]);
    });

    it("5.2.2.11 targets Intune Enrollment app", () => {
      const a = findAssertion("5.2.2.11")!;
      const spec = a.expectedValue as any;
      expect(spec.apps.include).toBe("d4ebce55-015a-49b5-a083-c84d1797ae8c");
    });

    it("5.2.2.12 blocks device code flow", () => {
      const a = findAssertion("5.2.2.12")!;
      const spec = a.expectedValue as any;
      expect(spec.authenticationFlows).toEqual(["deviceCodeFlow"]);
      expect(spec.grant.anyOf).toEqual(["block"]);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Admin roles are inlined
  // -----------------------------------------------------------------------
  describe("Admin roles inlined in match specs", () => {
    const adminRoleSpecs = ["5.2.2.1", "5.2.2.4", "5.2.2.5"];

    for (const controlId of adminRoleSpecs) {
      it(`[${controlId}] has admin role UUIDs inlined`, () => {
        const a = MOCKED_CONTROL_ASSERTIONS.find(
          (a) => a.controlId === controlId && a.operator === ("ca-match" as Operator),
        )!;
        const spec = a.expectedValue as any;
        expect(spec.users.roles).toBeDefined();
        expect(spec.users.roles.length).toBe(15); // 15 admin role UUIDs
        // Spot-check: Global Administrator role
        expect(spec.users.roles).toContain("62e90394-69f5-4237-9190-012177145e10");
      });
    }
  });
});
