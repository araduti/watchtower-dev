// =============================================================================
// Phase 0 — Permission catalog invariant tests
// =============================================================================
// These tests run WITHOUT a database. They validate the permission catalog
// data structure and system role definitions statically by importing the
// seed data directly.
// =============================================================================

import { describe, it, expect, vi } from "vitest";

// Mock @prisma/client enum since we don't generate the Prisma client in CI
vi.mock("@prisma/client", () => ({
  ScopeApplicability: {
    WORKSPACE_ONLY: "WORKSPACE_ONLY",
    SCOPE_ONLY: "SCOPE_ONLY",
    BOTH: "BOTH",
  },
}));

import {
  PERMISSIONS,
  SYSTEM_ROLES,
  LOCKED_PERMISSION_KEYS,
} from "../../prisma/seeds/permissions";

describe("Permission catalog invariants", () => {
  // ---------------------------------------------------------------------------
  // 1. Permission keys are unique — no duplicates in the PERMISSIONS array
  // ---------------------------------------------------------------------------
  it("permission keys are unique", () => {
    const keys = PERMISSIONS.map((p) => p.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  // ---------------------------------------------------------------------------
  // 2. Permission keys match {category}:{action} pattern
  // ---------------------------------------------------------------------------
  it("permission keys match {category}:{action} pattern", () => {
    const pattern = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;
    for (const p of PERMISSIONS) {
      expect(p.key, `key "${p.key}" does not match pattern`).toMatch(pattern);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Every permission's key starts with its category
  // ---------------------------------------------------------------------------
  it("every permission key starts with its category", () => {
    for (const p of PERMISSIONS) {
      expect(
        p.key.startsWith(`${p.category}:`),
        `key "${p.key}" should start with category "${p.category}:"`,
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. System role slugs are unique
  // ---------------------------------------------------------------------------
  it("system role slugs are unique", () => {
    const slugs = SYSTEM_ROLES.map((r) => r.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  // ---------------------------------------------------------------------------
  // 5. Owner role holds EVERY permission
  // ---------------------------------------------------------------------------
  it("owner role holds every permission", () => {
    const owner = SYSTEM_ROLES.find((r) => r.slug === "owner");
    expect(owner, "owner role must exist").toBeDefined();

    const allKeys = new Set(PERMISSIONS.map((p) => p.key));
    const ownerKeys = new Set(owner!.permissions);

    for (const key of allKeys) {
      expect(
        ownerKeys.has(key),
        `owner role is missing permission "${key}"`,
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Locked permissions exist in at least one system role
  // ---------------------------------------------------------------------------
  it("locked permissions appear in at least one system role", () => {
    const allSystemRolePermissions = new Set(
      SYSTEM_ROLES.flatMap((r) => [...r.permissions]),
    );

    for (const key of LOCKED_PERMISSION_KEYS) {
      expect(
        allSystemRolePermissions.has(key),
        `locked permission "${key}" is not in any system role`,
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Admin role does NOT hold locked permissions
  // ---------------------------------------------------------------------------
  it("admin role does not hold locked permissions", () => {
    const admin = SYSTEM_ROLES.find((r) => r.slug === "admin");
    expect(admin, "admin role must exist").toBeDefined();

    const adminKeys = new Set(admin!.permissions);

    for (const key of LOCKED_PERMISSION_KEYS) {
      expect(
        adminKeys.has(key),
        `admin role should NOT have locked permission "${key}"`,
      ).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // 8. Every system role permission references a valid catalog entry
  // ---------------------------------------------------------------------------
  it("every system role permission references a valid catalog entry", () => {
    const allKeys = new Set(PERMISSIONS.map((p) => p.key));

    for (const role of SYSTEM_ROLES) {
      for (const permKey of role.permissions) {
        expect(
          allKeys.has(permKey),
          `role "${role.slug}" references unknown permission "${permKey}"`,
        ).toBe(true);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 9. There are exactly 4 locked permissions
  // ---------------------------------------------------------------------------
  it("there are exactly 4 locked permissions", () => {
    expect(LOCKED_PERMISSION_KEYS).toHaveLength(4);

    const expected = new Set([
      "workspace:delete",
      "workspace:transfer_ownership",
      "members:remove_owner",
      "roles:edit_system_roles",
    ]);

    for (const key of LOCKED_PERMISSION_KEYS) {
      expect(
        expected.has(key),
        `unexpected locked permission "${key}"`,
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 10. There are exactly 60 permissions total
  // ---------------------------------------------------------------------------
  it("there are exactly 60 permissions total", () => {
    expect(PERMISSIONS).toHaveLength(60);
  });

  // ---------------------------------------------------------------------------
  // 11. There are exactly 4 system roles
  // ---------------------------------------------------------------------------
  it("there are exactly 4 system roles: owner, admin, compliance_officer, auditor", () => {
    expect(SYSTEM_ROLES).toHaveLength(4);

    const slugs = SYSTEM_ROLES.map((r) => r.slug);
    expect(slugs).toContain("owner");
    expect(slugs).toContain("admin");
    expect(slugs).toContain("compliance_officer");
    expect(slugs).toContain("auditor");
  });
});
