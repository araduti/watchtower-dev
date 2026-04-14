/**
 * evaluator-registry.test.ts
 *
 * Unit tests for the evaluator registry singleton.
 *
 * Because the registry is a module-level singleton that populates itself on
 * import (built-in evaluators + aliases), we test the *resulting state* rather
 * than calling register/registerAlias in isolation.
 */

import { describe, it, expect } from "vitest";
import {
  getEvaluator,
  registrySize,
  registeredSlugs,
} from "../../packages/engine/evaluators/registry.ts";
import { builtinEvaluators } from "../../packages/engine/evaluators/builtin/index.ts";

// ── Expected slug inventories ────────────────────────────────────────────────

/** All 33 built-in evaluator slugs loaded from builtinEvaluators. */
const BUILTIN_SLUGS = [
  // CIS / Entra ID
  "idle-session-timeout",
  "pra-requires-approval",
  "privileged-role-access-reviews-configured",
  "guest-access-reviews-configured",
  "pim-used-for-privileged-roles",
  "onprem-password-protection-enabled",
  "custom-banned-passwords-enabled",
  "b2b-allowed-domains-only",
  "dynamic-guest-group-exists",
  "personal-device-enrollment-blocked",

  // Teams
  "teams-security-reporting-enabled",
  "teams-unmanaged-inbound-disabled",
  "teams-unmanaged-access-disabled",
  "teams-external-access-restricted",

  // Exchange / transport
  "no-domain-whitelisting-transport-rules",
  "no-external-forwarding-transport-rules",

  // DNS
  "dmarc-published",
  "spf-records-published",
  "dmarc-reject",
  "dmarc-cisa-contact",

  // ScubaGear (implemented)
  "calendar-sharing-restricted",
  "user-consent-restricted",
  "preset-policies-enabled",

  // ScubaGear stubs (camelCase)
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

/** Alias → target mappings registered after built-ins. */
const ALIAS_MAP: Record<string, string> = {
  spfEnabled: "spf-records-published",
  dmarcPublished: "dmarc-published",
  dmarcReject: "dmarc-reject",
  dmarcCISAContact: "dmarc-cisa-contact",
  calendarSharingRestricted: "calendar-sharing-restricted",
  userConsentRestricted: "user-consent-restricted",
  presetPoliciesEnabled: "preset-policies-enabled",
};

const ALIAS_SLUGS = Object.keys(ALIAS_MAP);

/** kebab-case built-ins (everything except the 10 camelCase stubs). */
const KEBAB_CASE_SLUGS = BUILTIN_SLUGS.filter(
  (s) => s.includes("-"),
);

/** camelCase stub slugs. */
const CAMEL_CASE_STUB_SLUGS = BUILTIN_SLUGS.filter(
  (s) => !s.includes("-"),
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Evaluator Registry", () => {
  // ── 1. Built-in evaluator registration ──────────────────────────────────

  describe("built-in evaluator registration", () => {
    it.each(BUILTIN_SLUGS.map((s) => [s]))(
      'registers built-in evaluator "%s"',
      (slug) => {
        expect(getEvaluator(slug)).toBeDefined();
      },
    );

    it("has exactly 33 built-in evaluator modules", () => {
      expect(builtinEvaluators).toHaveLength(33);
    });
  });

  // ── 2. Alias registration ──────────────────────────────────────────────

  describe("alias registration", () => {
    it.each(Object.entries(ALIAS_MAP))(
      'alias "%s" resolves to the same function as "%s"',
      (alias, target) => {
        const aliasFn = getEvaluator(alias);
        const targetFn = getEvaluator(target);
        expect(aliasFn).toBeDefined();
        expect(targetFn).toBeDefined();
        // Aliases point to the exact same function reference
        expect(aliasFn).toBe(targetFn);
      },
    );

    it("has exactly 7 aliases registered", () => {
      expect(ALIAS_SLUGS).toHaveLength(7);
      for (const alias of ALIAS_SLUGS) {
        expect(getEvaluator(alias)).toBeDefined();
      }
    });
  });

  // ── 3. Registry size ────────────────────────────────────────────────────

  describe("registrySize()", () => {
    it("returns 40 (33 built-ins + 7 aliases)", () => {
      expect(registrySize()).toBe(40);
    });
  });

  // ── 4. registeredSlugs() completeness ───────────────────────────────────

  describe("registeredSlugs()", () => {
    it("contains every built-in slug", () => {
      const slugs = registeredSlugs();
      for (const expected of BUILTIN_SLUGS) {
        expect(slugs).toContain(expected);
      }
    });

    it("contains every alias slug", () => {
      const slugs = registeredSlugs();
      for (const alias of ALIAS_SLUGS) {
        expect(slugs).toContain(alias);
      }
    });

    it("contains exactly 40 slugs total", () => {
      expect(registeredSlugs()).toHaveLength(40);
    });
  });

  // ── 5. Unknown slug lookup ──────────────────────────────────────────────

  describe("getEvaluator() for unknown slugs", () => {
    it("returns undefined for a completely unknown slug", () => {
      expect(getEvaluator("this-slug-does-not-exist")).toBeUndefined();
    });

    it("returns undefined for an empty string slug", () => {
      expect(getEvaluator("")).toBeUndefined();
    });

    it("returns undefined for a near-miss slug", () => {
      expect(getEvaluator("dmarc_published")).toBeUndefined();
    });
  });

  // ── 6. Every registered evaluator is a function ─────────────────────────

  describe("evaluator function types", () => {
    it("every registered slug maps to a function", () => {
      const slugs = registeredSlugs();
      for (const slug of slugs) {
        const fn = getEvaluator(slug);
        expect(fn).toBeDefined();
        expect(typeof fn).toBe("function");
      }
    });
  });

  // ── 7. Slug naming conventions ──────────────────────────────────────────

  describe("slug naming conventions", () => {
    const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)+$/;

    it("non-stub built-in slugs follow kebab-case", () => {
      for (const slug of KEBAB_CASE_SLUGS) {
        expect(slug).toMatch(KEBAB_CASE_RE);
      }
    });

    it("stub slugs are camelCase (no hyphens)", () => {
      for (const slug of CAMEL_CASE_STUB_SLUGS) {
        expect(slug).not.toContain("-");
        // First character is lowercase (camelCase, not PascalCase)
        expect(slug[0]).toBe(slug[0]!.toLowerCase());
      }
    });

    it("there are exactly 10 camelCase stub slugs", () => {
      expect(CAMEL_CASE_STUB_SLUGS).toHaveLength(10);
    });

    it("there are exactly 23 kebab-case built-in slugs", () => {
      expect(KEBAB_CASE_SLUGS).toHaveLength(23);
    });
  });

  // ── 8. Built-in slug uniqueness ─────────────────────────────────────────

  describe("built-in slug uniqueness", () => {
    it("no two modules in builtinEvaluators share the same slug", () => {
      const slugs = builtinEvaluators.map((mod) => mod.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });

    it("every builtinEvaluators slug is unique (detailed check)", () => {
      const seen = new Map<string, number>();
      for (const mod of builtinEvaluators) {
        const count = seen.get(mod.slug) ?? 0;
        seen.set(mod.slug, count + 1);
      }
      const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
      expect(duplicates).toEqual([]);
    });
  });
});
