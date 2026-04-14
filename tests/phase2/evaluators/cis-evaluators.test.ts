/**
 * cis-evaluators.test.ts
 *
 * Unit tests for ten CIS / Entra ID evaluator modules:
 *   - idle-session-timeout
 *   - pra-requires-approval
 *   - privileged-role-access-reviews-configured
 *   - guest-access-reviews-configured
 *   - pim-used-for-privileged-roles
 *   - onprem-password-protection-enabled
 *   - custom-banned-passwords-enabled
 *   - b2b-allowed-domains-only
 *   - dynamic-guest-group-exists
 *   - personal-device-enrollment-blocked
 *
 * Each evaluator conforms to `EvaluatorModule { slug, evaluate }` and returns
 * `{ pass: boolean, warnings: string[] }`.  Tests cover slug identity,
 * pass/fail cases, empty/missing data, non-compliant data, and evaluator-
 * specific edge cases.
 */

import { describe, it, expect } from "vitest";

import idleSessionTimeout from "../../../packages/engine/evaluators/builtin/idle-session-timeout";
import praRequiresApproval from "../../../packages/engine/evaluators/builtin/pra-requires-approval";
import privilegedRoleAccessReviews from "../../../packages/engine/evaluators/builtin/privileged-role-access-reviews-configured";
import guestAccessReviews from "../../../packages/engine/evaluators/builtin/guest-access-reviews-configured";
import pimUsedForPrivilegedRoles from "../../../packages/engine/evaluators/builtin/pim-used-for-privileged-roles";
import onpremPasswordProtection from "../../../packages/engine/evaluators/builtin/onprem-password-protection-enabled";
import customBannedPasswords from "../../../packages/engine/evaluators/builtin/custom-banned-passwords-enabled";
import b2bAllowedDomainsOnly from "../../../packages/engine/evaluators/builtin/b2b-allowed-domains-only";
import dynamicGuestGroup from "../../../packages/engine/evaluators/builtin/dynamic-guest-group-exists";
import personalDeviceEnrollment from "../../../packages/engine/evaluators/builtin/personal-device-enrollment-blocked";

import { createSnapshot, createEmptySnapshot } from "../../factories/evidence";

// ─── Shared constants ────────────────────────────────────────────────────────

const PASSWORD_PROTECTION_TEMPLATE_ID = "5cf42378-d67d-4f36-ba46-e8b86229381d";

const AZURE_PORTAL_APP_ID = "c44b4083-3bb0-49c1-b47d-974e53cbdf3c";

/** A sensitive role ID from the PIM evaluator's SENSITIVE_ROLES set. */
const GLOBAL_ADMIN_ROLE_ID = "62e90394-69f5-4237-9190-012177145e10";
const SECURITY_ADMIN_ROLE_ID = "194ae4cb-b126-40b2-bd5b-6091b380977d";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a timeout policy definition JSON string with application policies. */
function buildTimeoutDefinition(
  apps: Array<{ ApplicationId?: string; WebSessionIdleTimeout: string }>,
): string {
  return JSON.stringify({
    ActivityBasedTimeoutPolicy: {
      ApplicationPolicies: apps,
    },
  });
}

/** Build an access review that meets all CIS requirements for role reviews. */
function buildCompliantRoleReview(overrides: Record<string, any> = {}) {
  return {
    status: "InProgress",
    scope: {
      "@odata.type": "#microsoft.graph.principalResourceMembershipsScope",
    },
    settings: {
      recurrence: { pattern: { type: "absoluteMonthly" } },
      mailNotificationsEnabled: true,
      reminderNotificationsEnabled: true,
      justificationRequiredOnApproval: true,
      autoApplyDecisionsEnabled: true,
    },
    ...overrides,
  };
}

/** Build an access review that meets all CIS requirements for guest reviews. */
function buildCompliantGuestReview(overrides: Record<string, any> = {}) {
  return {
    status: "InProgress",
    scope: {
      query: "/members (userType eq 'Guest')",
      principalScopes: [],
    },
    settings: {
      recurrence: { pattern: { type: "absoluteMonthly" } },
      mailNotificationsEnabled: true,
      reminderNotificationsEnabled: true,
      justificationRequiredOnApproval: true,
      autoApplyDecisionsEnabled: true,
      defaultDecision: "Deny",
    },
    ...overrides,
  };
}

/** Build a password protection setting with the correct templateId. */
function buildPasswordProtectionSetting(
  values: Array<{ name: string; value: string }>,
) {
  return {
    templateId: PASSWORD_PROTECTION_TEMPLATE_ID,
    values,
  };
}

/** Build the default platform restrictions enrollment config. */
function buildDefaultEnrollmentConfig(
  platforms: Record<string, { platformBlocked?: boolean; personalDeviceEnrollmentBlocked?: boolean }>,
) {
  return {
    id: "tenant_DefaultPlatformRestrictions",
    priority: 0,
    ...Object.fromEntries(
      Object.entries(platforms).map(([key, val]) => [`${key}Restriction`, val]),
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. idle-session-timeout
// ─────────────────────────────────────────────────────────────────────────────

describe("idle-session-timeout", () => {
  it('has slug "idle-session-timeout"', () => {
    expect(idleSessionTimeout.slug).toBe("idle-session-timeout");
  });

  it("passes when all app timeouts are ≤ 3 hours", () => {
    const snap = createSnapshot({
      timeoutPolicies: [
        {
          displayName: "Org Policy",
          definition: [
            buildTimeoutDefinition([
              { ApplicationId: "app-1", WebSessionIdleTimeout: "01:00:00" },
              { ApplicationId: "app-2", WebSessionIdleTimeout: "03:00:00" },
            ]),
          ],
        },
      ],
    });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails when no timeout policies exist", () => {
    const snap = createSnapshot({ timeoutPolicies: [] });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No activity-based timeout policy"),
    );
  });

  it("fails with empty snapshot data", () => {
    const snap = createEmptySnapshot();
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when a timeout exceeds 3 hours", () => {
    const snap = createSnapshot({
      timeoutPolicies: [
        {
          displayName: "Too Long",
          definition: [
            buildTimeoutDefinition([
              { ApplicationId: "app-1", WebSessionIdleTimeout: "04:00:00" },
            ]),
          ],
        },
      ],
    });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toContain("exceeds 3 hours");
  });

  it("skips Azure Portal app (c44b4083-…) and passes for others", () => {
    const snap = createSnapshot({
      timeoutPolicies: [
        {
          displayName: "With Portal",
          definition: [
            buildTimeoutDefinition([
              { ApplicationId: AZURE_PORTAL_APP_ID, WebSessionIdleTimeout: "08:00:00" },
              { ApplicationId: "other-app", WebSessionIdleTimeout: "02:00:00" },
            ]),
          ],
        },
      ],
    });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns on unparseable policy definition JSON", () => {
    const snap = createSnapshot({
      timeoutPolicies: [
        { displayName: "Bad JSON", definition: ["not-json{{{"] },
      ],
    });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Could not parse"),
    );
  });

  it("passes when timeout is exactly 3 hours (boundary)", () => {
    const snap = createSnapshot({
      timeoutPolicies: [
        {
          displayName: "Boundary",
          definition: [
            buildTimeoutDefinition([
              { ApplicationId: "app-1", WebSessionIdleTimeout: "03:00:00" },
            ]),
          ],
        },
      ],
    });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails when timeout is 03:00:01 (one second over)", () => {
    const snap = createSnapshot({
      timeoutPolicies: [
        {
          displayName: "Just Over",
          definition: [
            buildTimeoutDefinition([
              { ApplicationId: "app-1", WebSessionIdleTimeout: "03:00:01" },
            ]),
          ],
        },
      ],
    });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings[0]).toContain("exceeds 3 hours");
  });

  it("handles policy with empty definition array", () => {
    const snap = createSnapshot({
      timeoutPolicies: [{ displayName: "Empty Def", definition: [] }],
    });
    const result = idleSessionTimeout.evaluate(snap);
    // definition[0] is undefined → JSON.parse("{}") → no ApplicationPolicies → passes (no violating apps)
    expect(result.pass).toBe(true);
  });

  it("handles multiple policies, fails if any exceeds threshold", () => {
    const snap = createSnapshot({
      timeoutPolicies: [
        {
          displayName: "Policy A",
          definition: [
            buildTimeoutDefinition([
              { ApplicationId: "app-a", WebSessionIdleTimeout: "01:00:00" },
            ]),
          ],
        },
        {
          displayName: "Policy B",
          definition: [
            buildTimeoutDefinition([
              { ApplicationId: "app-b", WebSessionIdleTimeout: "05:00:00" },
            ]),
          ],
        },
      ],
    });
    const result = idleSessionTimeout.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining("app-b"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. pra-requires-approval
// ─────────────────────────────────────────────────────────────────────────────

describe("pra-requires-approval", () => {
  it('has slug "pra-requires-approval"', () => {
    expect(praRequiresApproval.slug).toBe("pra-requires-approval");
  });

  it("passes when approval is enabled with ≥ 2 approvers", () => {
    const snap = createSnapshot({
      praRoleManagementPolicyRules: [
        {
          "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule",
          setting: {
            isApprovalRequired: true,
            approvalStages: [
              { primaryApprovers: [{ id: "a1" }, { id: "a2" }] },
            ],
          },
        },
      ],
    });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails with empty rules array", () => {
    const snap = createSnapshot({ praRoleManagementPolicyRules: [] });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No PRA policy rules"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when no approval rule is present in rules", () => {
    const snap = createSnapshot({
      praRoleManagementPolicyRules: [
        { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule" },
      ],
    });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No approval rule found"),
    );
  });

  it("fails when approval is not enabled", () => {
    const snap = createSnapshot({
      praRoleManagementPolicyRules: [
        {
          "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule",
          setting: {
            isApprovalRequired: false,
            approvalStages: [
              { primaryApprovers: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] },
            ],
          },
        },
      ],
    });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("not enabled"),
    );
  });

  it("fails when fewer than 2 approvers configured", () => {
    const snap = createSnapshot({
      praRoleManagementPolicyRules: [
        {
          "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule",
          setting: {
            isApprovalRequired: true,
            approvalStages: [
              { primaryApprovers: [{ id: "a1" }] },
            ],
          },
        },
      ],
    });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("minimum 2 required"),
    );
  });

  it("fails with zero approvers", () => {
    const snap = createSnapshot({
      praRoleManagementPolicyRules: [
        {
          "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule",
          setting: {
            isApprovalRequired: true,
            approvalStages: [{ primaryApprovers: [] }],
          },
        },
      ],
    });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("0 approver"),
    );
  });

  it("matches approval rule case-insensitively on odata.type", () => {
    const snap = createSnapshot({
      praRoleManagementPolicyRules: [
        {
          "@odata.type": "#microsoft.graph.UnifiedRoleManagementPolicyAPPROVALRULE",
          setting: {
            isApprovalRequired: true,
            approvalStages: [
              { primaryApprovers: [{ id: "a1" }, { id: "a2" }] },
            ],
          },
        },
      ],
    });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("reports both issues when approval disabled AND too few approvers", () => {
    const snap = createSnapshot({
      praRoleManagementPolicyRules: [
        {
          "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule",
          setting: {
            isApprovalRequired: false,
            approvalStages: [{ primaryApprovers: [{ id: "a1" }] }],
          },
        },
      ],
    });
    const result = praRequiresApproval.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. privileged-role-access-reviews-configured
// ─────────────────────────────────────────────────────────────────────────────

describe("privileged-role-access-reviews-configured", () => {
  it('has slug "privileged-role-access-reviews-configured"', () => {
    expect(privilegedRoleAccessReviews.slug).toBe(
      "privileged-role-access-reviews-configured",
    );
  });

  it("passes with a fully compliant role access review", () => {
    const snap = createSnapshot({
      accessReviews: [buildCompliantRoleReview()],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes with weekly recurrence", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantRoleReview({
          settings: {
            recurrence: { pattern: { type: "weekly" } },
            mailNotificationsEnabled: true,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: true,
            autoApplyDecisionsEnabled: true,
          },
        }),
      ],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("fails with empty access reviews", () => {
    const snap = createSnapshot({ accessReviews: [] });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No access reviews found"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when no reviews target directory roles", () => {
    const snap = createSnapshot({
      accessReviews: [
        {
          status: "InProgress",
          scope: { "@odata.type": "#microsoft.graph.someOtherScope" },
          settings: {
            recurrence: { pattern: { type: "absoluteMonthly" } },
            mailNotificationsEnabled: true,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: true,
            autoApplyDecisionsEnabled: true,
          },
        },
      ],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No access reviews targeting directory roles"),
    );
  });

  it("fails when review status is not InProgress", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantRoleReview({ status: "Completed" }),
      ],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("none meet all CIS requirements"),
    );
  });

  it("fails when autoApply is not enabled", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantRoleReview({
          settings: {
            recurrence: { pattern: { type: "absoluteMonthly" } },
            mailNotificationsEnabled: true,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: true,
            autoApplyDecisionsEnabled: false,
          },
        }),
      ],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when mail notifications are disabled", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantRoleReview({
          settings: {
            recurrence: { pattern: { type: "absoluteMonthly" } },
            mailNotificationsEnabled: false,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: true,
            autoApplyDecisionsEnabled: true,
          },
        }),
      ],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails with quarterly recurrence (not monthly/weekly)", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantRoleReview({
          settings: {
            recurrence: { pattern: { type: "absoluteQuarterly" } },
            mailNotificationsEnabled: true,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: true,
            autoApplyDecisionsEnabled: true,
          },
        }),
      ],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("passes when at least one of several reviews is compliant", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantRoleReview({ status: "Completed" }), // non-compliant
        buildCompliantRoleReview(), // compliant
      ],
    });
    const result = privilegedRoleAccessReviews.evaluate(snap);
    expect(result.pass).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. guest-access-reviews-configured
// ─────────────────────────────────────────────────────────────────────────────

describe("guest-access-reviews-configured", () => {
  it('has slug "guest-access-reviews-configured"', () => {
    expect(guestAccessReviews.slug).toBe("guest-access-reviews-configured");
  });

  it("passes with a fully compliant guest access review (scope.query)", () => {
    const snap = createSnapshot({
      accessReviews: [buildCompliantGuestReview()],
    });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when guest filter is in principalScopes", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantGuestReview({
          scope: {
            query: "",
            principalScopes: [
              { query: "/users (userType eq 'Guest')" },
            ],
          },
        }),
      ],
    });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("fails with empty access reviews", () => {
    const snap = createSnapshot({ accessReviews: [] });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No access reviews found"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when no reviews target guest users", () => {
    const snap = createSnapshot({
      accessReviews: [
        {
          status: "InProgress",
          scope: { query: "/members", principalScopes: [] },
          settings: {
            recurrence: { pattern: { type: "absoluteMonthly" } },
            mailNotificationsEnabled: true,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: true,
            autoApplyDecisionsEnabled: true,
            defaultDecision: "Deny",
          },
        },
      ],
    });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No access reviews targeting guest users"),
    );
  });

  it("fails when defaultDecision is not Deny", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantGuestReview({
          settings: {
            recurrence: { pattern: { type: "absoluteMonthly" } },
            mailNotificationsEnabled: true,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: true,
            autoApplyDecisionsEnabled: true,
            defaultDecision: "Approve",
          },
        }),
      ],
    });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when justification is not required", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantGuestReview({
          settings: {
            recurrence: { pattern: { type: "absoluteMonthly" } },
            mailNotificationsEnabled: true,
            reminderNotificationsEnabled: true,
            justificationRequiredOnApproval: false,
            autoApplyDecisionsEnabled: true,
            defaultDecision: "Deny",
          },
        }),
      ],
    });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("passes when at least one guest review is compliant among many", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantGuestReview({ status: "Completed" }), // non-compliant
        buildCompliantGuestReview(), // compliant
      ],
    });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("matches guest query case-insensitively", () => {
    const snap = createSnapshot({
      accessReviews: [
        buildCompliantGuestReview({
          scope: {
            query: "/members (USERTYPE EQ 'GUEST')",
            principalScopes: [],
          },
        }),
      ],
    });
    const result = guestAccessReviews.evaluate(snap);
    expect(result.pass).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. pim-used-for-privileged-roles
// ─────────────────────────────────────────────────────────────────────────────

describe("pim-used-for-privileged-roles", () => {
  it('has slug "pim-used-for-privileged-roles"', () => {
    expect(pimUsedForPrivilegedRoles.slug).toBe("pim-used-for-privileged-roles");
  });

  it("passes when all permanent assignments have corresponding eligible assignments", () => {
    const principalId = "user-1";
    const snap = createSnapshot({
      privilegedUsers: [
        {
          roleTemplateId: GLOBAL_ADMIN_ROLE_ID,
          principalId,
          principal: { userPrincipalName: "admin@example.com" },
        },
      ],
      pimEligibleAssignments: [
        { roleDefinitionId: GLOBAL_ADMIN_ROLE_ID, principalId },
      ],
    });
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails when both privilegedUsers and pimEligibleAssignments are empty", () => {
    const snap = createSnapshot({
      privilegedUsers: [],
      pimEligibleAssignments: [],
    });
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No role assignments found"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when permanent assignment has no corresponding eligible assignment", () => {
    const snap = createSnapshot({
      privilegedUsers: [
        {
          roleTemplateId: GLOBAL_ADMIN_ROLE_ID,
          principalId: "user-permanent",
          principal: { userPrincipalName: "admin@example.com" },
        },
      ],
      pimEligibleAssignments: [],
    });
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("admin@example.com"),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("should be eligible (JIT) only"),
    );
  });

  it("ignores permanent assignments to non-sensitive roles", () => {
    const nonSensitiveRole = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const snap = createSnapshot({
      privilegedUsers: [
        {
          roleTemplateId: nonSensitiveRole,
          principalId: "user-1",
          principal: { userPrincipalName: "user@example.com" },
        },
      ],
      pimEligibleAssignments: [
        // Also give an eligible assignment for a sensitive role to avoid "no assignments" fallback
        { roleDefinitionId: GLOBAL_ADMIN_ROLE_ID, principalId: "user-2" },
      ],
    });
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("passes when only eligible (PIM) assignments exist, no permanent", () => {
    const snap = createSnapshot({
      privilegedUsers: [],
      pimEligibleAssignments: [
        { roleDefinitionId: GLOBAL_ADMIN_ROLE_ID, principalId: "user-1" },
      ],
    });
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("reports each offending principal separately", () => {
    const snap = createSnapshot({
      privilegedUsers: [
        {
          roleTemplateId: GLOBAL_ADMIN_ROLE_ID,
          principalId: "user-1",
          principal: { userPrincipalName: "admin1@example.com" },
        },
        {
          roleTemplateId: SECURITY_ADMIN_ROLE_ID,
          principalId: "user-2",
          principal: { userPrincipalName: "admin2@example.com" },
        },
      ],
      pimEligibleAssignments: [],
    });
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("admin1@example.com");
    expect(result.warnings[1]).toContain("admin2@example.com");
  });

  it("skips privilegedUser entries without userPrincipalName", () => {
    const snap = createSnapshot({
      privilegedUsers: [
        {
          roleTemplateId: GLOBAL_ADMIN_ROLE_ID,
          principalId: "svc-account",
          principal: {},
        },
      ],
      pimEligibleAssignments: [
        { roleDefinitionId: GLOBAL_ADMIN_ROLE_ID, principalId: "other-user" },
      ],
    });
    const result = pimUsedForPrivilegedRoles.evaluate(snap);
    // Entry without userPrincipalName is filtered out by the evaluator
    expect(result.pass).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. onprem-password-protection-enabled
// ─────────────────────────────────────────────────────────────────────────────

describe("onprem-password-protection-enabled", () => {
  it('has slug "onprem-password-protection-enabled"', () => {
    expect(onpremPasswordProtection.slug).toBe(
      "onprem-password-protection-enabled",
    );
  });

  it("passes when on-prem check is True and mode is Enforce", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheckOnPremises", value: "True" },
          { name: "BannedPasswordCheckOnPremisesMode", value: "Enforce" },
        ]),
      ],
    });
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails with empty settings array", () => {
    const snap = createSnapshot({ passwordProtectionSettings: [] });
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No password protection settings"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when setting with correct templateId is not found", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        { templateId: "wrong-template-id", values: [] },
      ],
    });
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No password protection settings"),
    );
  });

  it("fails when on-prem check is not True", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheckOnPremises", value: "False" },
          { name: "BannedPasswordCheckOnPremisesMode", value: "Enforce" },
        ]),
      ],
    });
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("EnableBannedPasswordCheckOnPremises is False"),
    );
  });

  it("fails when mode is Audit instead of Enforce", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheckOnPremises", value: "True" },
          { name: "BannedPasswordCheckOnPremisesMode", value: "Audit" },
        ]),
      ],
    });
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("BannedPasswordCheckOnPremisesMode is Audit"),
    );
  });

  it("reports both issues when neither setting is correct", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheckOnPremises", value: "False" },
          { name: "BannedPasswordCheckOnPremisesMode", value: "Audit" },
        ]),
      ],
    });
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });

  it("fails when values array is empty (settings not set)", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([]),
      ],
    });
    const result = onpremPasswordProtection.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("not set"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. custom-banned-passwords-enabled
// ─────────────────────────────────────────────────────────────────────────────

describe("custom-banned-passwords-enabled", () => {
  it('has slug "custom-banned-passwords-enabled"', () => {
    expect(customBannedPasswords.slug).toBe("custom-banned-passwords-enabled");
  });

  it("passes when ban check is True and list is non-empty", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheck", value: "True" },
          { name: "BannedPasswordList", value: "password123\ncompanyname" },
        ]),
      ],
    });
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails with empty settings array", () => {
    const snap = createSnapshot({ passwordProtectionSettings: [] });
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No password protection settings"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when EnableBannedPasswordCheck is False", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheck", value: "False" },
          { name: "BannedPasswordList", value: "password123" },
        ]),
      ],
    });
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("EnableBannedPasswordCheck is False"),
    );
  });

  it("fails when BannedPasswordList is empty", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheck", value: "True" },
          { name: "BannedPasswordList", value: "" },
        ]),
      ],
    });
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("BannedPasswordList is empty"),
    );
  });

  it("fails when BannedPasswordList is whitespace-only", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheck", value: "True" },
          { name: "BannedPasswordList", value: "   \t\n  " },
        ]),
      ],
    });
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("BannedPasswordList is empty"),
    );
  });

  it("fails when BannedPasswordList is missing entirely", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheck", value: "True" },
        ]),
      ],
    });
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("BannedPasswordList is empty"),
    );
  });

  it("reports both issues when check is disabled and list is empty", () => {
    const snap = createSnapshot({
      passwordProtectionSettings: [
        buildPasswordProtectionSetting([
          { name: "EnableBannedPasswordCheck", value: "False" },
          { name: "BannedPasswordList", value: "" },
        ]),
      ],
    });
    const result = customBannedPasswords.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. b2b-allowed-domains-only
// ─────────────────────────────────────────────────────────────────────────────

describe("b2b-allowed-domains-only", () => {
  it('has slug "b2b-allowed-domains-only"', () => {
    expect(b2bAllowedDomainsOnly.slug).toBe("b2b-allowed-domains-only");
  });

  it("passes when AllowedDomains is configured", () => {
    const definition = JSON.stringify({
      B2BManagementPolicy: {
        InvitationsAllowedAndBlockedDomainsPolicy: {
          AllowedDomains: ["partner.com", "vendor.com"],
        },
      },
    });
    const snap = createSnapshot({
      b2bManagementPolicy: [
        { type: "B2BManagementPolicy", definition: [definition] },
      ],
    });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails with empty policy array", () => {
    const snap = createSnapshot({ b2bManagementPolicy: [] });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No B2B management policy"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when no B2BManagementPolicy type is found", () => {
    const snap = createSnapshot({
      b2bManagementPolicy: [
        { type: "SomeOtherPolicy", definition: ["{}"] },
      ],
    });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No B2BManagementPolicy found"),
    );
  });

  it("fails when BlockedDomains is used instead of AllowedDomains", () => {
    const definition = JSON.stringify({
      B2BManagementPolicy: {
        InvitationsAllowedAndBlockedDomainsPolicy: {
          BlockedDomains: ["evil.com"],
        },
      },
    });
    const snap = createSnapshot({
      b2bManagementPolicy: [
        { type: "B2BManagementPolicy", definition: [definition] },
      ],
    });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("BlockedDomains is set"),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("AllowedDomains"),
    );
  });

  it("fails when no domain restriction policy is defined", () => {
    const definition = JSON.stringify({
      B2BManagementPolicy: {},
    });
    const snap = createSnapshot({
      b2bManagementPolicy: [
        { type: "B2BManagementPolicy", definition: [definition] },
      ],
    });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No domain restriction policy defined"),
    );
  });

  it("fails when AllowedDomains is not defined (InvitationsAllowedAndBlockedDomainsPolicy exists but empty)", () => {
    const definition = JSON.stringify({
      B2BManagementPolicy: {
        InvitationsAllowedAndBlockedDomainsPolicy: {},
      },
    });
    const snap = createSnapshot({
      b2bManagementPolicy: [
        { type: "B2BManagementPolicy", definition: [definition] },
      ],
    });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No AllowedDomains defined"),
    );
  });

  it("fails when definition JSON is unparseable", () => {
    const snap = createSnapshot({
      b2bManagementPolicy: [
        { type: "B2BManagementPolicy", definition: ["not-valid-json{{"] },
      ],
    });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Failed to parse"),
    );
  });

  it("fails when definition array is empty", () => {
    const snap = createSnapshot({
      b2bManagementPolicy: [
        { type: "B2BManagementPolicy", definition: [] },
      ],
    });
    const result = b2bAllowedDomainsOnly.evaluate(snap);
    expect(result.pass).toBe(false);
    // definition[0] is undefined → JSON.parse("{}") → no InvitationsAllowedAndBlockedDomainsPolicy
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No domain restriction policy defined"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. dynamic-guest-group-exists
// ─────────────────────────────────────────────────────────────────────────────

describe("dynamic-guest-group-exists", () => {
  it('has slug "dynamic-guest-group-exists"', () => {
    expect(dynamicGuestGroup.slug).toBe("dynamic-guest-group-exists");
  });

  it("passes when a matching dynamic guest group exists", () => {
    const snap = createSnapshot({
      groups: [
        {
          groupTypes: ["DynamicMembership"],
          membershipRule: '(user.userType -eq "Guest")',
          membershipRuleProcessingState: "On",
        },
      ],
    });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails with empty groups array", () => {
    const snap = createSnapshot({ groups: [] });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No dynamic group found"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when group is not DynamicMembership type", () => {
    const snap = createSnapshot({
      groups: [
        {
          groupTypes: ["Unified"],
          membershipRule: '(user.userType -eq "Guest")',
          membershipRuleProcessingState: "On",
        },
      ],
    });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when membershipRule does not contain guest userType", () => {
    const snap = createSnapshot({
      groups: [
        {
          groupTypes: ["DynamicMembership"],
          membershipRule: '(user.department -eq "IT")',
          membershipRuleProcessingState: "On",
        },
      ],
    });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when membershipRuleProcessingState is Paused", () => {
    const snap = createSnapshot({
      groups: [
        {
          groupTypes: ["DynamicMembership"],
          membershipRule: '(user.userType -eq "Guest")',
          membershipRuleProcessingState: "Paused",
        },
      ],
    });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("matches membershipRule case-insensitively", () => {
    const snap = createSnapshot({
      groups: [
        {
          groupTypes: ["DynamicMembership"],
          membershipRule: '(USER.USERTYPE -EQ "GUEST")',
          membershipRuleProcessingState: "On",
        },
      ],
    });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("passes when matching group is among multiple groups", () => {
    const snap = createSnapshot({
      groups: [
        {
          groupTypes: ["Unified"],
          membershipRule: null,
          membershipRuleProcessingState: null,
        },
        {
          groupTypes: ["DynamicMembership"],
          membershipRule: '(user.userType -eq "Guest") and (user.accountEnabled -eq true)',
          membershipRuleProcessingState: "On",
        },
      ],
    });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("fails when groupTypes is not an array", () => {
    const snap = createSnapshot({
      groups: [
        {
          groupTypes: "DynamicMembership", // string, not array
          membershipRule: '(user.userType -eq "Guest")',
          membershipRuleProcessingState: "On",
        },
      ],
    });
    const result = dynamicGuestGroup.evaluate(snap);
    expect(result.pass).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. personal-device-enrollment-blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("personal-device-enrollment-blocked", () => {
  it('has slug "personal-device-enrollment-blocked"', () => {
    expect(personalDeviceEnrollment.slug).toBe(
      "personal-device-enrollment-blocked",
    );
  });

  it("passes when all platforms block personal enrollment", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        buildDefaultEnrollmentConfig({
          windows: { personalDeviceEnrollmentBlocked: true },
          ios: { personalDeviceEnrollmentBlocked: true },
          android: { personalDeviceEnrollmentBlocked: true },
          androidForWork: { personalDeviceEnrollmentBlocked: true },
          macOS: { personalDeviceEnrollmentBlocked: true },
        }),
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("passes when platforms are completely blocked (platformBlocked=true)", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        buildDefaultEnrollmentConfig({
          windows: { platformBlocked: true },
          ios: { platformBlocked: true },
          android: { platformBlocked: true },
          androidForWork: { platformBlocked: true },
          macOS: { platformBlocked: true },
        }),
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("passes with a mix of platformBlocked and personalDeviceEnrollmentBlocked", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        buildDefaultEnrollmentConfig({
          windows: { personalDeviceEnrollmentBlocked: true },
          ios: { platformBlocked: true },
          android: { personalDeviceEnrollmentBlocked: true },
          androidForWork: { platformBlocked: true },
          macOS: { personalDeviceEnrollmentBlocked: true },
        }),
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(true);
  });

  it("fails with empty configurations array", () => {
    const snap = createSnapshot({ enrollmentConfigurations: [] });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No enrollment configurations"),
    );
  });

  it("fails with empty snapshot", () => {
    const snap = createEmptySnapshot();
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(false);
  });

  it("fails when DefaultPlatformRestrictions config is not found", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        { id: "some-other-config", priority: 0 },
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Default platform restriction policy not found"),
    );
  });

  it("fails when one platform allows personal devices", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        buildDefaultEnrollmentConfig({
          windows: { personalDeviceEnrollmentBlocked: true },
          ios: { personalDeviceEnrollmentBlocked: false },
          android: { personalDeviceEnrollmentBlocked: true },
          androidForWork: { personalDeviceEnrollmentBlocked: true },
          macOS: { personalDeviceEnrollmentBlocked: true },
        }),
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("iOS");
  });

  it("reports each failing platform individually", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        buildDefaultEnrollmentConfig({
          windows: { personalDeviceEnrollmentBlocked: false, platformBlocked: false },
          ios: { personalDeviceEnrollmentBlocked: false, platformBlocked: false },
          android: { personalDeviceEnrollmentBlocked: true },
          androidForWork: { personalDeviceEnrollmentBlocked: false },
          macOS: { personalDeviceEnrollmentBlocked: true },
        }),
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.join("|")).toContain("Windows");
    expect(result.warnings.join("|")).toContain("iOS");
    expect(result.warnings.join("|")).toContain("Android for Work");
  });

  it("fails when restrictions are undefined (platform not configured)", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        {
          id: "tenant_DefaultPlatformRestrictions",
          priority: 0,
          // No restriction properties defined at all
        },
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(false);
    // All 5 platforms should fail
    expect(result.warnings).toHaveLength(5);
  });

  it("ignores non-default configs (priority != 0)", () => {
    const snap = createSnapshot({
      enrollmentConfigurations: [
        {
          id: "tenant_DefaultPlatformRestrictions",
          priority: 1, // not the default
          windowsRestriction: { personalDeviceEnrollmentBlocked: true },
          iosRestriction: { personalDeviceEnrollmentBlocked: true },
          androidRestriction: { personalDeviceEnrollmentBlocked: true },
          androidForWorkRestriction: { personalDeviceEnrollmentBlocked: true },
          macOSRestriction: { personalDeviceEnrollmentBlocked: true },
        },
      ],
    });
    const result = personalDeviceEnrollment.evaluate(snap);
    expect(result.pass).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Default platform restriction policy not found"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-evaluator sanity checks
// ─────────────────────────────────────────────────────────────────────────────

describe("cross-evaluator sanity", () => {
  it("all 10 evaluators have unique slugs", () => {
    const evaluators = [
      idleSessionTimeout,
      praRequiresApproval,
      privilegedRoleAccessReviews,
      guestAccessReviews,
      pimUsedForPrivilegedRoles,
      onpremPasswordProtection,
      customBannedPasswords,
      b2bAllowedDomainsOnly,
      dynamicGuestGroup,
      personalDeviceEnrollment,
    ];
    const slugs = evaluators.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(evaluators.length);
  });

  it("all evaluators return { pass, warnings } from an empty snapshot", () => {
    const evaluators = [
      idleSessionTimeout,
      praRequiresApproval,
      privilegedRoleAccessReviews,
      guestAccessReviews,
      pimUsedForPrivilegedRoles,
      onpremPasswordProtection,
      customBannedPasswords,
      b2bAllowedDomainsOnly,
      dynamicGuestGroup,
      personalDeviceEnrollment,
    ];
    const snap = createEmptySnapshot();
    for (const mod of evaluators) {
      const result = mod.evaluate(snap);
      expect(result).toHaveProperty("pass");
      expect(result).toHaveProperty("warnings");
      expect(typeof result.pass).toBe("boolean");
      expect(Array.isArray(result.warnings)).toBe(true);
    }
  });

  it("all evaluators expose a callable evaluate function", () => {
    const evaluators = [
      idleSessionTimeout,
      praRequiresApproval,
      privilegedRoleAccessReviews,
      guestAccessReviews,
      pimUsedForPrivilegedRoles,
      onpremPasswordProtection,
      customBannedPasswords,
      b2bAllowedDomainsOnly,
      dynamicGuestGroup,
      personalDeviceEnrollment,
    ];
    for (const mod of evaluators) {
      expect(typeof mod.evaluate).toBe("function");
      expect(typeof mod.slug).toBe("string");
      expect(mod.slug.length).toBeGreaterThan(0);
    }
  });
});
