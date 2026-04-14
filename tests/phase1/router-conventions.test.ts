// =============================================================================
// Phase 1.1 — Router convention tests
// =============================================================================
// Validates that all routers follow Watchtower's non-negotiable conventions.
// Source-level static analysis — no database required.
//
// Every router must:
// - Use ctx.db for database access (Non-Negotiable #1)
// - Require idempotencyKey for mutations (Non-Negotiable #2)
// - Call ctx.requirePermission (Non-Negotiable #3)
// - Use Zod for input/output (Non-Negotiable #4)
// - Use TRPCError with Layer 2 codes (Non-Negotiable #8, #9)
// - Use cursor pagination (Non-Negotiable #6)
// - Filter deletedAt: null for soft-delete models (Non-Negotiable #7)
// - Write audit log for mutations (Code-Conventions §1)
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const root = process.cwd();
const routersDir = join(root, "apps", "web", "src", "server", "routers");

function readRouter(filename: string): string {
  return readFileSync(join(routersDir, filename), "utf-8");
}

/** Get all router source files (excluding _app.ts and index.ts) */
function getRouterFiles(): string[] {
  return readdirSync(routersDir)
    .filter((f) => f.endsWith(".ts") && f !== "_app.ts" && f !== "index.ts");
}

describe("Router conventions", () => {
  const routerFiles = getRouterFiles();

  it("has at least 3 routers registered", () => {
    // permission.ts, workspace.ts, scope.ts
    expect(routerFiles.length).toBeGreaterThanOrEqual(3);
  });

  describe("_app.ts — router registration", () => {
    const appSrc = readRouter("_app.ts");

    it("registers permission router", () => {
      expect(appSrc).toContain("permissionRouter");
      expect(appSrc).toContain("permission:");
    });

    it("registers workspace router", () => {
      expect(appSrc).toContain("workspaceRouter");
      expect(appSrc).toContain("workspace:");
    });

    it("registers scope router", () => {
      expect(appSrc).toContain("scopeRouter");
      expect(appSrc).toContain("scope:");
    });
  });

  describe("Non-Negotiable #1: all routers use ctx.db (never new PrismaClient)", () => {
    for (const file of routerFiles) {
      it(`${file} uses ctx.db`, () => {
        const src = readRouter(file);
        expect(src).toContain("ctx.db.");
        expect(src).not.toContain("new PrismaClient");
      });
    }
  });

  describe("Non-Negotiable #3: all routers call requirePermission", () => {
    for (const file of routerFiles) {
      it(`${file} calls ctx.requirePermission`, () => {
        const src = readRouter(file);
        expect(src).toContain("ctx.requirePermission");
      });
    }
  });

  describe("Non-Negotiable #4: all routers use Zod schemas", () => {
    for (const file of routerFiles) {
      it(`${file} imports and uses Zod`, () => {
        const src = readRouter(file);
        expect(src).toContain('from "zod"');
        expect(src).toContain("z.object");
      });
    }
  });

  describe("Non-Negotiable #6: list operations use cursor pagination", () => {
    for (const file of routerFiles) {
      const src = readRouter(file);
      if (src.includes(".query(")) {
        it(`${file} uses cursor-based pagination (not offset)`, () => {
          if (src.includes("cursor")) {
            expect(src).toContain("nextCursor");
            expect(src).toContain("limit + 1");
            expect(src).not.toContain("offset");
          }
        });
      }
    }
  });

  describe("workspace.ts — workspace router specifics", () => {
    const src = readRouter("workspace.ts");

    it("Non-Negotiable #2: updateSettings requires idempotencyKey", () => {
      expect(src).toContain("idempotencyKey");
      expect(src).toContain("z.string().uuid()");
    });

    it("Non-Negotiable #7: filters deletedAt: null", () => {
      expect(src).toContain("deletedAt: null");
    });

    it("Code-Conventions §1: writes audit log for updateSettings", () => {
      expect(src).toContain("createAuditEvent");
      expect(src).toContain("workspace.updateSettings");
    });

    it("uses Layer 2 error codes from @watchtower/errors", () => {
      expect(src).toContain("WATCHTOWER_ERRORS");
      expect(src).toContain("throwWatchtowerError");
    });

    it("tracks changes in audit metadata", () => {
      expect(src).toContain("changes");
      expect(src).toContain("from:");
      expect(src).toContain("to:");
    });

    it("checks workspace:read permission for get", () => {
      expect(src).toContain('"workspace:read"');
    });

    it("checks workspace:edit_settings permission for updateSettings", () => {
      expect(src).toContain('"workspace:edit_settings"');
    });

    it("has both get and updateSettings procedures", () => {
      expect(src).toContain("get:");
      expect(src).toContain("updateSettings:");
    });
  });

  describe("scope.ts — scope router specifics", () => {
    const src = readRouter("scope.ts");

    it("Non-Negotiable #7: filters deletedAt: null", () => {
      expect(src).toContain("deletedAt: null");
    });

    it("list filters by accessible scope IDs (Layer 2 explicit SQL)", () => {
      expect(src).toContain("accessibleScopeIds");
    });

    it("checks scopes:read permission", () => {
      expect(src).toContain('"scopes:read"');
    });

    it("get derives scope from resource for permission check", () => {
      // Per API-Conventions §5: scope derived from resource, not input
      expect(src).toContain("scopeId: scope.id");
    });

    it("has both list and get procedures", () => {
      expect(src).toContain("list:");
      expect(src).toContain("get:");
    });

    it("uses cursor pagination for list", () => {
      expect(src).toContain("nextCursor");
      expect(src).toContain("limit + 1");
    });
  });

  describe("permission.ts — no remaining Phase 1.0 TODOs", () => {
    const src = readRouter("permission.ts");

    it("no longer has Phase 1.1 TODO comments", () => {
      expect(src).not.toContain("TODO: Phase 1.1");
    });

    it("no longer imports prisma directly", () => {
      // Phase 1.0 had: const { prisma } = await import("@watchtower/db");
      // Phase 1.1 uses ctx.db
      expect(src).not.toContain('import("@watchtower/db")');
    });

    it("uses ctx.db for database access", () => {
      expect(src).toContain("ctx.db.");
    });
  });
});
