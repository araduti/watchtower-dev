// =============================================================================
// Phase 2.0 — Router convention tests
// =============================================================================
// Validates that ALL Phase 2.0 routers follow Watchtower's non-negotiable
// conventions. Source-level static analysis — no database required.
//
// Organised by concern:
//  §1  Router registration (_app.ts completeness)
//  §2  Universal conventions (every router)
//  §3  Mutation conventions (tenant, member, role, finding)
//  §4  Read-only conventions (check, framework, evidence, audit)
//  §5  Security invariants
//  §6  Pagination conventions
//  §7  Scope derivation (API-Conventions §5)
//  §8  deletedAt conventions
//  §9  Finding-specific (state machine)
//  §10 Audit-specific (tamper-evidence exclusion)
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const root = process.cwd();
const routersDir = join(root, "apps", "web", "src", "server", "routers");

function readRouter(filename: string): string {
  return readFileSync(join(routersDir, filename), "utf-8");
}

function getRouterFiles(): string[] {
  return readdirSync(routersDir).filter(
    (f) => f.endsWith(".ts") && f !== "_app.ts" && f !== "index.ts",
  );
}

// ---------------------------------------------------------------------------
// Phase 2.0 router files (the 8 new routers)
// ---------------------------------------------------------------------------

const PHASE2_ROUTERS = [
  "tenant.ts",
  "member.ts",
  "role.ts",
  "check.ts",
  "framework.ts",
  "finding.ts",
  "evidence.ts",
  "audit.ts",
  "scan.ts",
] as const;

/** Routers that contain mutations (create / update / delete / state changes) */
const MUTATION_ROUTERS = [
  "tenant.ts",
  "member.ts",
  "role.ts",
  "finding.ts",
  "scan.ts",
] as const;

/** Routers that are strictly read-only */
const READ_ONLY_ROUTERS = [
  "check.ts",
  "framework.ts",
  "evidence.ts",
  "audit.ts",
] as const;

/** All 13 routers that must be registered in _app.ts */
const ALL_REGISTERED_ROUTERS = [
  { key: "audit", export: "auditRouter" },
  { key: "check", export: "checkRouter" },
  { key: "evidence", export: "evidenceRouter" },
  { key: "finding", export: "findingRouter" },
  { key: "framework", export: "frameworkRouter" },
  { key: "member", export: "memberRouter" },
  { key: "permission", export: "permissionRouter" },
  { key: "plugin", export: "pluginRouter" },
  { key: "role", export: "roleRouter" },
  { key: "scan", export: "scanRouter" },
  { key: "scope", export: "scopeRouter" },
  { key: "tenant", export: "tenantRouter" },
  { key: "workspace", export: "workspaceRouter" },
] as const;

// ==========================================================================
// §1 — Router Registration (_app.ts)
// ==========================================================================

describe("§1 — Router registration in _app.ts", () => {
  const appSrc = readRouter("_app.ts");

  it("has exactly 13 routers registered", () => {
    const routerFiles = getRouterFiles();
    expect(routerFiles.length).toBe(13);
  });

  for (const { key, export: exportName } of ALL_REGISTERED_ROUTERS) {
    it(`imports ${exportName} from ./${key}.ts`, () => {
      expect(appSrc).toContain(exportName);
    });

    it(`registers ${key}: ${exportName}`, () => {
      expect(appSrc).toContain(`${key}: ${exportName}`);
    });
  }

  it("exports appRouter", () => {
    expect(appSrc).toContain("export const appRouter");
  });

  it("exports AppRouter type", () => {
    expect(appSrc).toContain("export type AppRouter");
  });
});

// ==========================================================================
// §2 — Universal conventions (every Phase 2.0 router)
// ==========================================================================

describe("§2 — Convention compliance for every Phase 2.0 router", () => {
  describe("Non-Negotiable #1: uses ctx.db (never new PrismaClient)", () => {
    for (const file of PHASE2_ROUTERS) {
      it(`${file} uses ctx.db for database access`, () => {
        const src = readRouter(file);
        expect(src).toContain("ctx.db.");
        expect(src).not.toContain("new PrismaClient");
      });
    }
  });

  describe("All routers use protectedProcedure (never publicProcedure)", () => {
    for (const file of PHASE2_ROUTERS) {
      it(`${file} uses protectedProcedure only`, () => {
        const src = readRouter(file);
        expect(src).toContain("protectedProcedure");
        expect(src).not.toContain("publicProcedure");
      });
    }
  });

  describe("Non-Negotiable #3: all routers call ctx.requirePermission", () => {
    for (const file of PHASE2_ROUTERS) {
      it(`${file} calls ctx.requirePermission`, () => {
        const src = readRouter(file);
        expect(src).toContain("ctx.requirePermission");
      });
    }
  });

  describe("Non-Negotiable #4: all routers use Zod schemas", () => {
    for (const file of PHASE2_ROUTERS) {
      it(`${file} imports z from "zod"`, () => {
        const src = readRouter(file);
        expect(src).toContain('from "zod"');
      });

      it(`${file} uses z.object for schemas`, () => {
        const src = readRouter(file);
        expect(src).toContain("z.object");
      });
    }
  });

  describe("All routers have .output() on procedures", () => {
    for (const file of PHASE2_ROUTERS) {
      it(`${file} uses .output() schema validation`, () => {
        const src = readRouter(file);
        expect(src).toContain(".output(");
      });
    }
  });

  describe("Mutation routers import from @watchtower/errors", () => {
    for (const file of MUTATION_ROUTERS) {
      it(`${file} imports WATCHTOWER_ERRORS`, () => {
        const src = readRouter(file);
        expect(src).toContain('from "@watchtower/errors"');
      });

      it(`${file} imports throwWatchtowerError`, () => {
        const src = readRouter(file);
        expect(src).toContain("throwWatchtowerError");
      });
    }
  });
});

// ==========================================================================
// §3 — Mutation-specific conventions
// ==========================================================================

describe("§3 — Mutation conventions (tenant, member, role, finding)", () => {
  describe("Non-Negotiable #2: mutations require idempotencyKey", () => {
    for (const file of MUTATION_ROUTERS) {
      it(`${file} includes idempotencyKey in mutation input schemas`, () => {
        const src = readRouter(file);
        expect(src).toContain("idempotencyKey");
      });
    }
  });

  describe("API-Conventions §8: idempotency helpers", () => {
    for (const file of MUTATION_ROUTERS) {
      it(`${file} imports checkIdempotencyKey`, () => {
        const src = readRouter(file);
        expect(src).toContain("checkIdempotencyKey");
      });

      it(`${file} imports saveIdempotencyResult`, () => {
        const src = readRouter(file);
        expect(src).toContain("saveIdempotencyResult");
      });

      it(`${file} calls checkIdempotencyKey before mutation`, () => {
        const src = readRouter(file);
        // Each mutation should check for cached result
        const checkCount = (src.match(/checkIdempotencyKey\(/g) ?? []).length;
        // At least import + 1 usage
        expect(checkCount).toBeGreaterThanOrEqual(1);
      });

      it(`${file} calls saveIdempotencyResult after mutation`, () => {
        const src = readRouter(file);
        const saveCount = (src.match(/saveIdempotencyResult\(/g) ?? []).length;
        expect(saveCount).toBeGreaterThanOrEqual(1);
      });
    }
  });

  describe("Code-Conventions §1: mutations use createAuditEvent from @watchtower/db", () => {
    for (const file of MUTATION_ROUTERS) {
      it(`${file} imports createAuditEvent from @watchtower/db`, () => {
        const src = readRouter(file);
        expect(src).toContain("createAuditEvent");
        expect(src).toContain('from "@watchtower/db"');
      });

      it(`${file} never calls ctx.db.auditEvent.create directly`, () => {
        const src = readRouter(file);
        expect(src).not.toContain("ctx.db.auditEvent.create");
      });
    }
  });
});

// ==========================================================================
// §4 — Read-only router conventions
// ==========================================================================

describe("§4 — Read-only router conventions", () => {
  describe("evidence.ts and audit.ts do NOT have mutation procedures", () => {
    it("evidence.ts has no mutation keywords (create, update, delete)", () => {
      const src = readRouter("evidence.ts");
      expect(src).not.toContain("idempotencyKey");
      expect(src).not.toContain("createAuditEvent");
      expect(src).not.toContain(".mutation(");
    });

    it("audit.ts has no mutation keywords (create, update, delete)", () => {
      const src = readRouter("audit.ts");
      expect(src).not.toContain("idempotencyKey");
      expect(src).not.toContain("createAuditEvent");
      expect(src).not.toContain(".mutation(");
    });
  });

  describe("check.ts and framework.ts do NOT import idempotency helpers", () => {
    it("check.ts does not import checkIdempotencyKey", () => {
      const src = readRouter("check.ts");
      expect(src).not.toContain("checkIdempotencyKey");
      expect(src).not.toContain("saveIdempotencyResult");
    });

    it("framework.ts does not import checkIdempotencyKey", () => {
      const src = readRouter("framework.ts");
      expect(src).not.toContain("checkIdempotencyKey");
      expect(src).not.toContain("saveIdempotencyResult");
    });
  });

  describe("read-only routers only expose list/get procedures", () => {
    it("check.ts has list and get procedures only", () => {
      const src = readRouter("check.ts");
      expect(src).toContain("list:");
      expect(src).toContain("get:");
      expect(src).not.toContain("create:");
      expect(src).not.toContain("update:");
      expect(src).not.toContain("delete:");
    });

    it("framework.ts has list and get procedures only", () => {
      const src = readRouter("framework.ts");
      expect(src).toContain("list:");
      expect(src).toContain("get:");
      expect(src).not.toContain("create:");
      expect(src).not.toContain("update:");
      expect(src).not.toContain("delete:");
    });

    it("evidence.ts has list and get procedures only", () => {
      const src = readRouter("evidence.ts");
      expect(src).toContain("list:");
      expect(src).toContain("get:");
      expect(src).not.toContain("create:");
      expect(src).not.toContain("update:");
      expect(src).not.toContain("delete:");
    });

    it("audit.ts has list procedure only", () => {
      const src = readRouter("audit.ts");
      expect(src).toContain("list:");
      expect(src).not.toContain("get:");
      expect(src).not.toContain("create:");
      expect(src).not.toContain("update:");
      expect(src).not.toContain("delete:");
    });
  });
});

// ==========================================================================
// §5 — Security conventions
// ==========================================================================

describe("§5 — Security conventions", () => {
  describe("tenant.ts NEVER selects encryptedCredentials", () => {
    it("TENANT_SELECT does not include encryptedCredentials", () => {
      const src = readRouter("tenant.ts");
      // The TENANT_SELECT constant must not contain encryptedCredentials: true
      const selectBlock = src.slice(
        src.indexOf("TENANT_SELECT"),
        src.indexOf("} as const;", src.indexOf("TENANT_SELECT")) + "} as const;".length,
      );
      expect(selectBlock).not.toContain("encryptedCredentials: true");
    });

    it("tenant.ts documents the security invariant", () => {
      const src = readRouter("tenant.ts");
      expect(src).toContain("encryptedCredentials NEVER selected");
    });
  });

  describe("finding.ts has individual state transition procedures (not generic updateStatus)", () => {
    it("finding.ts does NOT have a generic updateStatus procedure", () => {
      const src = readRouter("finding.ts");
      expect(src).not.toContain("updateStatus:");
    });

    it("finding.ts has acknowledge, mute, acceptRisk, resolve as separate procedures", () => {
      const src = readRouter("finding.ts");
      expect(src).toContain("acknowledge:");
      expect(src).toContain("mute:");
      expect(src).toContain("acceptRisk:");
      expect(src).toContain("resolve:");
    });
  });

  describe("finding.ts throws domain-specific error codes", () => {
    const src = readRouter("finding.ts");

    it("throws ALREADY_MUTED", () => {
      expect(src).toContain("ALREADY_MUTED");
    });

    it("throws ALREADY_ACKNOWLEDGED", () => {
      expect(src).toContain("ALREADY_ACKNOWLEDGED");
    });

    it("throws ACCEPTANCE_MISSING_EXPIRATION", () => {
      expect(src).toContain("ACCEPTANCE_MISSING_EXPIRATION");
    });

    it("throws INVALID_TRANSITION", () => {
      expect(src).toContain("INVALID_TRANSITION");
    });
  });

  describe("role.ts throws SYSTEM_ROLE_IMMUTABLE and LOCKED_PERMISSION", () => {
    const src = readRouter("role.ts");

    it("throws SYSTEM_ROLE_IMMUTABLE", () => {
      expect(src).toContain("SYSTEM_ROLE_IMMUTABLE");
    });

    it("throws LOCKED_PERMISSION", () => {
      expect(src).toContain("LOCKED_PERMISSION");
    });
  });

  describe("member.ts throws CANNOT_REMOVE_OWNER and ALREADY_MEMBER", () => {
    const src = readRouter("member.ts");

    it("throws CANNOT_REMOVE_OWNER", () => {
      expect(src).toContain("CANNOT_REMOVE_OWNER");
    });

    it("throws ALREADY_MEMBER", () => {
      expect(src).toContain("ALREADY_MEMBER");
    });
  });

  describe("tenant.ts throws ALREADY_CONNECTED", () => {
    it("throws ALREADY_CONNECTED for duplicate msTenantId", () => {
      const src = readRouter("tenant.ts");
      expect(src).toContain("ALREADY_CONNECTED");
    });
  });

  describe("scan.ts throws ALREADY_RUNNING and CANNOT_CANCEL", () => {
    it("throws ALREADY_RUNNING for duplicate active scan", () => {
      const src = readRouter("scan.ts");
      expect(src).toContain("ALREADY_RUNNING");
    });

    it("throws CANNOT_CANCEL for terminal scan states", () => {
      const src = readRouter("scan.ts");
      expect(src).toContain("CANNOT_CANCEL");
    });
  });

  describe("correct permission strings per router", () => {
    it("tenant.ts checks tenants:read, tenants:create, tenants:edit, tenants:delete", () => {
      const src = readRouter("tenant.ts");
      expect(src).toContain('"tenants:read"');
      expect(src).toContain('"tenants:create"');
      expect(src).toContain('"tenants:edit"');
      expect(src).toContain('"tenants:delete"');
    });

    it("member.ts checks members:read, members:invite, members:remove, members:edit_roles", () => {
      const src = readRouter("member.ts");
      expect(src).toContain('"members:read"');
      expect(src).toContain('"members:invite"');
      expect(src).toContain('"members:remove"');
      expect(src).toContain('"members:edit_roles"');
    });

    it("role.ts checks roles:read, roles:create, roles:edit, roles:delete", () => {
      const src = readRouter("role.ts");
      expect(src).toContain('"roles:read"');
      expect(src).toContain('"roles:create"');
      expect(src).toContain('"roles:edit"');
      expect(src).toContain('"roles:delete"');
    });

    it("finding.ts checks findings:read, findings:acknowledge, findings:mute, findings:accept_risk, findings:resolve", () => {
      const src = readRouter("finding.ts");
      expect(src).toContain('"findings:read"');
      expect(src).toContain('"findings:acknowledge"');
      expect(src).toContain('"findings:mute"');
      expect(src).toContain('"findings:accept_risk"');
      expect(src).toContain('"findings:resolve"');
    });

    it("check.ts checks checks:read", () => {
      const src = readRouter("check.ts");
      expect(src).toContain('"checks:read"');
    });

    it("framework.ts checks frameworks:read", () => {
      const src = readRouter("framework.ts");
      expect(src).toContain('"frameworks:read"');
    });

    it("evidence.ts checks evidence:read", () => {
      const src = readRouter("evidence.ts");
      expect(src).toContain('"evidence:read"');
    });

    it("audit.ts checks workspace:view_audit_log", () => {
      const src = readRouter("audit.ts");
      expect(src).toContain('"workspace:view_audit_log"');
    });

    it("scan.ts checks scans:read, scans:trigger, scans:cancel", () => {
      const src = readRouter("scan.ts");
      expect(src).toContain('"scans:read"');
      expect(src).toContain('"scans:trigger"');
      expect(src).toContain('"scans:cancel"');
    });
  });
});

// ==========================================================================
// §6 — Pagination conventions
// ==========================================================================

describe("§6 — Pagination conventions", () => {
  describe("every list procedure uses take: and cursor pattern", () => {
    for (const file of PHASE2_ROUTERS) {
      const src = readRouter(file);

      it(`${file} uses take: input.limit + 1 (fetch one extra for hasMore)`, () => {
        expect(src).toContain("input.limit + 1");
      });

      it(`${file} outputs nextCursor`, () => {
        expect(src).toContain("nextCursor");
      });
    }
  });

  describe("no offset-based pagination", () => {
    for (const file of PHASE2_ROUTERS) {
      it(`${file} does not use offset pagination`, () => {
        const src = readRouter(file);
        expect(src).not.toContain("offset:");
        expect(src).not.toContain("skip: input.offset");
      });
    }
  });

  describe("list output schemas have nextCursor field", () => {
    for (const file of PHASE2_ROUTERS) {
      it(`${file} includes nextCursor: z.string().nullable() in output`, () => {
        const src = readRouter(file);
        // All list outputs define nextCursor as nullable string
        expect(src).toContain("nextCursor: z.string().nullable()");
      });
    }
  });
});

// ==========================================================================
// §7 — Scope derivation (API-Conventions §5)
// ==========================================================================

describe("§7 — Scope derivation from resource (not from input)", () => {
  it("finding.ts derives scopeId from finding.scopeId for permission checks", () => {
    const src = readRouter("finding.ts");
    expect(src).toContain("scopeId: finding.scopeId");
  });

  it("tenant.ts derives scopeId from tenant/existing record for permission checks", () => {
    const src = readRouter("tenant.ts");
    // get procedure derives from tenant
    expect(src).toContain("scopeId: tenant.scopeId");
    // update/softDelete derive from existing record
    expect(src).toContain("scopeId: existing.scopeId");
  });

  it("evidence.ts derives scopeId from evidence.scopeId for get permission check", () => {
    const src = readRouter("evidence.ts");
    expect(src).toContain("scopeId: evidence.scopeId");
  });

  it("finding.ts does NOT accept scopeId as mutation input", () => {
    const src = readRouter("finding.ts");
    // acknowledge, mute, acceptRisk, resolve should NOT take scopeId as input
    // They derive it from the finding record
    const mutationInputs = [
      src.slice(src.indexOf("acknowledge:"), src.indexOf("mute:")),
      src.slice(src.indexOf("mute:"), src.indexOf("acceptRisk:")),
      src.slice(src.indexOf("acceptRisk:"), src.indexOf("resolve:")),
    ];
    for (const block of mutationInputs) {
      // Scope is derived from the fetched finding, not provided in input
      const inputSection = block.slice(
        block.indexOf(".input("),
        block.indexOf(".output("),
      );
      expect(inputSection).not.toContain("scopeId:");
    }
  });

  it("scan.ts derives scopeId from scan/tenant/existing record for permission checks", () => {
    const src = readRouter("scan.ts");
    // get procedure derives from scan
    expect(src).toContain("scopeId: scan.scopeId");
    // trigger derives from tenant
    expect(src).toContain("scopeId: tenant.scopeId");
    // cancel derives from existing record
    expect(src).toContain("scopeId: existing.scopeId");
  });
});

// ==========================================================================
// §8 — deletedAt conventions
// ==========================================================================

describe("§8 — deletedAt conventions", () => {
  it("tenant.ts filters deletedAt: null for queries", () => {
    const src = readRouter("tenant.ts");
    expect(src).toContain("deletedAt: null");
  });

  it("finding.ts does NOT filter deletedAt (findings are durable, never deleted)", () => {
    const src = readRouter("finding.ts");
    // Findings have no deletedAt column — they are permanent records
    expect(src).not.toContain("deletedAt: null");
    expect(src).not.toContain("deletedAt:");
  });

  it("check.ts does NOT filter deletedAt: null (global catalog, never deleted)", () => {
    const src = readRouter("check.ts");
    expect(src).not.toContain("deletedAt: null");
    expect(src).not.toContain("deletedAt:");
  });

  it("framework.ts does NOT filter deletedAt: null (global catalog, never deleted)", () => {
    const src = readRouter("framework.ts");
    expect(src).not.toContain("deletedAt: null");
    expect(src).not.toContain("deletedAt:");
  });

  it("evidence.ts does NOT filter deletedAt: null (append-only, never deleted)", () => {
    const src = readRouter("evidence.ts");
    expect(src).not.toContain("deletedAt: null");
    expect(src).not.toContain("deletedAt:");
  });

  it("audit.ts does NOT filter deletedAt: null (append-only, never deleted)", () => {
    const src = readRouter("audit.ts");
    expect(src).not.toContain("deletedAt: null");
    expect(src).not.toContain("deletedAt:");
  });

  it("member.ts does NOT filter deletedAt (hard-deleted, no soft-delete)", () => {
    const src = readRouter("member.ts");
    expect(src).not.toContain("deletedAt");
  });

  it("role.ts does NOT filter deletedAt (hard-deleted, no soft-delete)", () => {
    const src = readRouter("role.ts");
    expect(src).not.toContain("deletedAt");
  });

  it("scan.ts uses deletedAt: null ONLY for tenant lookups (scans are never deleted)", () => {
    const src = readRouter("scan.ts");
    // Scan queries themselves never filter on deletedAt — scans are permanent
    // But the trigger mutation checks tenant.deletedAt: null (tenants can be soft-deleted)
    expect(src).toContain("deletedAt: null");
    // The scan findFirst/findMany calls should NOT have deletedAt in their where clauses
    // Only the tenant lookup has deletedAt: null
    const triggerBlock = src.slice(src.indexOf("trigger:"), src.indexOf("cancel:"));
    expect(triggerBlock).toContain("deletedAt: null");
  });
});

// ==========================================================================
// §9 — Finding-specific tests (state machine)
// ==========================================================================

describe("§9 — Finding-specific conventions", () => {
  const src = readRouter("finding.ts");

  describe("has all required state transition procedures", () => {
    it("has acknowledge procedure", () => {
      expect(src).toContain("acknowledge: protectedProcedure");
    });

    it("has mute procedure", () => {
      expect(src).toContain("mute: protectedProcedure");
    });

    it("has acceptRisk procedure", () => {
      expect(src).toContain("acceptRisk: protectedProcedure");
    });

    it("has resolve procedure", () => {
      expect(src).toContain("resolve: protectedProcedure");
    });
  });

  describe("each state transition has its own idempotency flow", () => {
    it("acknowledge calls checkIdempotencyKey", () => {
      const block = src.slice(src.indexOf("acknowledge:"), src.indexOf("mute:"));
      expect(block).toContain("checkIdempotencyKey");
      expect(block).toContain("saveIdempotencyResult");
    });

    it("mute calls checkIdempotencyKey", () => {
      const block = src.slice(src.indexOf("mute:"), src.indexOf("acceptRisk:"));
      expect(block).toContain("checkIdempotencyKey");
      expect(block).toContain("saveIdempotencyResult");
    });

    it("acceptRisk calls checkIdempotencyKey", () => {
      const block = src.slice(src.indexOf("acceptRisk:"), src.indexOf("resolve:"));
      expect(block).toContain("checkIdempotencyKey");
      expect(block).toContain("saveIdempotencyResult");
    });

    it("resolve calls checkIdempotencyKey", () => {
      const block = src.slice(src.indexOf("resolve:"));
      expect(block).toContain("checkIdempotencyKey");
      expect(block).toContain("saveIdempotencyResult");
    });
  });

  describe("status transition guards exist", () => {
    it("acknowledge guards against ALREADY_ACKNOWLEDGED", () => {
      const block = src.slice(src.indexOf("acknowledge:"), src.indexOf("mute:"));
      expect(block).toContain("ALREADY_ACKNOWLEDGED");
    });

    it("acknowledge guards against INVALID_TRANSITION (not OPEN)", () => {
      const block = src.slice(src.indexOf("acknowledge:"), src.indexOf("mute:"));
      expect(block).toContain("INVALID_TRANSITION");
    });

    it("mute guards against ALREADY_MUTED", () => {
      const block = src.slice(src.indexOf("mute:"), src.indexOf("acceptRisk:"));
      expect(block).toContain("ALREADY_MUTED");
    });

    it("acceptRisk guards against ACCEPTANCE_MISSING_EXPIRATION", () => {
      const block = src.slice(src.indexOf("acceptRisk:"), src.indexOf("resolve:"));
      expect(block).toContain("ACCEPTANCE_MISSING_EXPIRATION");
    });

    it("resolve guards against INVALID_TRANSITION", () => {
      const block = src.slice(src.indexOf("resolve:"));
      expect(block).toContain("INVALID_TRANSITION");
    });
  });

  describe("each mutation writes an audit event", () => {
    it("acknowledge writes an audit event", () => {
      const block = src.slice(src.indexOf("acknowledge:"), src.indexOf("mute:"));
      expect(block).toContain("createAuditEvent");
    });

    it("mute writes an audit event", () => {
      const block = src.slice(src.indexOf("mute:"), src.indexOf("acceptRisk:"));
      expect(block).toContain("createAuditEvent");
    });

    it("acceptRisk writes an audit event", () => {
      const block = src.slice(src.indexOf("acceptRisk:"), src.indexOf("resolve:"));
      expect(block).toContain("createAuditEvent");
    });

    it("resolve writes an audit event", () => {
      const block = src.slice(src.indexOf("resolve:"));
      expect(block).toContain("createAuditEvent");
    });
  });

  describe("finding.ts uses distinct permissions for each state transition", () => {
    it("acknowledge uses findings:acknowledge permission", () => {
      const block = src.slice(src.indexOf("acknowledge:"), src.indexOf("mute:"));
      expect(block).toContain('"findings:acknowledge"');
    });

    it("mute uses findings:mute permission", () => {
      const block = src.slice(src.indexOf("mute:"), src.indexOf("acceptRisk:"));
      expect(block).toContain('"findings:mute"');
    });

    it("acceptRisk uses findings:accept_risk permission", () => {
      const block = src.slice(src.indexOf("acceptRisk:"), src.indexOf("resolve:"));
      expect(block).toContain('"findings:accept_risk"');
    });

    it("resolve uses findings:resolve permission", () => {
      const block = src.slice(src.indexOf("resolve:"));
      expect(block).toContain('"findings:resolve"');
    });
  });
});

// ==========================================================================
// §10 — Audit-specific tests (tamper-evidence exclusion)
// ==========================================================================

describe("§10 — Audit-specific conventions", () => {
  const src = readRouter("audit.ts");

  describe("AUDIT_LIST_SELECT does NOT expose tamper-evidence fields", () => {
    const selectBlock = src.slice(
      src.indexOf("AUDIT_LIST_SELECT"),
      src.indexOf("} as const;", src.indexOf("AUDIT_LIST_SELECT")) +
        "} as const;".length,
    );

    it("does NOT expose prevHash", () => {
      expect(selectBlock).not.toContain("prevHash");
    });

    it("does NOT expose rowHash", () => {
      expect(selectBlock).not.toContain("rowHash");
    });

    it("does NOT expose signature", () => {
      expect(selectBlock).not.toContain("signature");
    });

    it("does NOT expose signingKeyId", () => {
      expect(selectBlock).not.toContain("signingKeyId");
    });
  });

  describe("audit list excludes PII fields", () => {
    const selectBlock = src.slice(
      src.indexOf("AUDIT_LIST_SELECT"),
      src.indexOf("} as const;", src.indexOf("AUDIT_LIST_SELECT")) +
        "} as const;".length,
    );

    it("does NOT expose actorIp", () => {
      expect(selectBlock).not.toContain("actorIp");
    });

    it("does NOT expose actorUserAgent", () => {
      expect(selectBlock).not.toContain("actorUserAgent");
    });
  });

  it("audit.ts documents the tamper-evidence exclusion", () => {
    expect(src).toContain("prevHash, rowHash");
    expect(src).toContain("signature, signingKeyId");
  });

  it("uses workspace:view_audit_log permission (workspace-level, not scope-level)", () => {
    expect(src).toContain('"workspace:view_audit_log"');
  });

  it("audit.ts has only a list procedure (no get, no mutations)", () => {
    expect(src).toContain("list:");
    // Audit events are accessed via list only — no individual get
    expect(src).not.toContain("get: protectedProcedure");
    expect(src).not.toContain("create:");
    expect(src).not.toContain("update:");
    expect(src).not.toContain("delete:");
  });

  it("audit list includes chainSequence for ordering", () => {
    const selectBlock = src.slice(
      src.indexOf("AUDIT_LIST_SELECT"),
      src.indexOf("} as const;", src.indexOf("AUDIT_LIST_SELECT")) +
        "} as const;".length,
    );
    expect(selectBlock).toContain("chainSequence");
  });
});

// ==========================================================================
// §11 — Router-specific procedure structure
// ==========================================================================

describe("§11 — Router procedure completeness", () => {
  it("tenant.ts has list, get, create, update, softDelete procedures", () => {
    const src = readRouter("tenant.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
    expect(src).toContain("create:");
    expect(src).toContain("update:");
    expect(src).toContain("softDelete:");
  });

  it("member.ts has list, get, invite, remove, updateRole procedures", () => {
    const src = readRouter("member.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
    expect(src).toContain("invite:");
    expect(src).toContain("remove:");
    expect(src).toContain("updateRole:");
  });

  it("role.ts has list, get, create, update, delete procedures", () => {
    const src = readRouter("role.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
    expect(src).toContain("create:");
    expect(src).toContain("update:");
    expect(src).toContain("delete:");
  });

  it("finding.ts has list, get, acknowledge, mute, acceptRisk, resolve procedures", () => {
    const src = readRouter("finding.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
    expect(src).toContain("acknowledge:");
    expect(src).toContain("mute:");
    expect(src).toContain("acceptRisk:");
    expect(src).toContain("resolve:");
  });

  it("check.ts has list and get procedures", () => {
    const src = readRouter("check.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
  });

  it("framework.ts has list and get procedures", () => {
    const src = readRouter("framework.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
  });

  it("evidence.ts has list and get procedures", () => {
    const src = readRouter("evidence.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
  });

  it("audit.ts has list procedure", () => {
    const src = readRouter("audit.ts");
    expect(src).toContain("list:");
  });

  it("scan.ts has list, get, trigger, cancel procedures", () => {
    const src = readRouter("scan.ts");
    expect(src).toContain("list:");
    expect(src).toContain("get:");
    expect(src).toContain("trigger:");
    expect(src).toContain("cancel:");
  });
});

// ==========================================================================
// §12 — Role-specific conventions
// ==========================================================================

describe("§12 — Role-specific conventions", () => {
  const src = readRouter("role.ts");

  it("validates locked permissions (assignableToCustomRoles)", () => {
    expect(src).toContain("assignableToCustomRoles");
  });

  it("guards system roles from update", () => {
    const updateBlock = src.slice(src.indexOf("update:"), src.indexOf("delete:"));
    expect(updateBlock).toContain("SYSTEM_ROLE_IMMUTABLE");
  });

  it("guards system roles from deletion", () => {
    const deleteBlock = src.slice(src.indexOf("delete:"));
    expect(deleteBlock).toContain("SYSTEM_ROLE_IMMUTABLE");
  });

  it("each mutation (create, update, delete) writes an audit event", () => {
    const createBlock = src.slice(src.indexOf("create:"), src.indexOf("update:"));
    expect(createBlock).toContain("createAuditEvent");

    const updateBlock = src.slice(src.indexOf("update:"), src.indexOf("delete:"));
    expect(updateBlock).toContain("createAuditEvent");

    const deleteBlock = src.slice(src.indexOf("delete:"));
    expect(deleteBlock).toContain("createAuditEvent");
  });
});

// ==========================================================================
// §13 — Member-specific conventions
// ==========================================================================

describe("§13 — Member-specific conventions", () => {
  const src = readRouter("member.ts");

  it("invite checks for duplicate membership before creating", () => {
    const inviteBlock = src.slice(src.indexOf("invite:"), src.indexOf("remove:"));
    expect(inviteBlock).toContain("ALREADY_MEMBER");
  });

  it("remove guards against removing the owner role", () => {
    const removeBlock = src.slice(src.indexOf("remove:"), src.indexOf("updateRole:"));
    expect(removeBlock).toContain("CANNOT_REMOVE_OWNER");
  });

  it("each mutation (invite, remove, updateRole) writes an audit event", () => {
    const inviteBlock = src.slice(src.indexOf("invite:"), src.indexOf("remove:"));
    expect(inviteBlock).toContain("createAuditEvent");

    const removeBlock = src.slice(src.indexOf("remove:"), src.indexOf("updateRole:"));
    expect(removeBlock).toContain("createAuditEvent");

    const updateRoleBlock = src.slice(src.indexOf("updateRole:"));
    expect(updateRoleBlock).toContain("createAuditEvent");
  });
});

// ==========================================================================
// §14 — Tenant-specific conventions
// ==========================================================================

describe("§14 — Tenant-specific conventions", () => {
  const src = readRouter("tenant.ts");

  it("create checks for duplicate msTenantId (ALREADY_CONNECTED)", () => {
    const createBlock = src.slice(src.indexOf("create:"), src.indexOf("update:"));
    expect(createBlock).toContain("ALREADY_CONNECTED");
  });

  it("each mutation (create, update, softDelete) writes an audit event", () => {
    const createBlock = src.slice(src.indexOf("create:"), src.indexOf("update:"));
    expect(createBlock).toContain("createAuditEvent");

    const updateBlock = src.slice(src.indexOf("update:"), src.indexOf("softDelete:"));
    expect(updateBlock).toContain("createAuditEvent");

    const softDeleteBlock = src.slice(src.indexOf("softDelete:"));
    expect(softDeleteBlock).toContain("createAuditEvent");
  });

  it("uses soft-delete (softDelete procedure) instead of hard-delete", () => {
    expect(src).toContain("softDelete:");
    // Should not have a hard-delete procedure named "delete:"
    expect(src).not.toMatch(/\bdelete:\s*protectedProcedure/);
  });
});

// ==========================================================================
// §15 — Scan-specific conventions
// ==========================================================================

describe("§15 — Scan-specific conventions", () => {
  const src = readRouter("scan.ts");

  describe("inngestRunId is NEVER exposed in output", () => {
    it("SCAN_SELECT does not include inngestRunId", () => {
      // SCAN_SELECT must not contain inngestRunId: true
      const selectBlock = src.slice(
        src.indexOf("SCAN_SELECT"),
        src.indexOf("// -- list"),
      );
      expect(selectBlock).not.toContain("inngestRunId");
    });

    it("output schema does not include inngestRunId", () => {
      // Check only the z.object block for scanOutput, not the SCAN_SELECT comment
      const outputStart = src.indexOf("const scanOutput = z.object");
      const outputEnd = src.indexOf("});", outputStart) + 3;
      const outputBlock = src.slice(outputStart, outputEnd);
      expect(outputBlock).not.toContain("inngestRunId");
    });
  });

  describe("trigger procedure conventions", () => {
    it("trigger creates scan with triggeredBy: MANUAL", () => {
      const triggerBlock = src.slice(
        src.indexOf("trigger:"),
        src.indexOf("cancel:"),
      );
      expect(triggerBlock).toContain('"MANUAL"');
    });

    it("trigger sets triggeredByUserId from session", () => {
      const triggerBlock = src.slice(
        src.indexOf("trigger:"),
        src.indexOf("cancel:"),
      );
      expect(triggerBlock).toContain("ctx.session.userId");
    });

    it("trigger checks for active scans before creating (ALREADY_RUNNING guard)", () => {
      const triggerBlock = src.slice(
        src.indexOf("trigger:"),
        src.indexOf("cancel:"),
      );
      expect(triggerBlock).toContain("ALREADY_RUNNING");
    });

    it("trigger verifies tenant exists and is not soft-deleted", () => {
      const triggerBlock = src.slice(
        src.indexOf("trigger:"),
        src.indexOf("cancel:"),
      );
      expect(triggerBlock).toContain("deletedAt: null");
      expect(triggerBlock).toContain("TENANT.NOT_FOUND");
    });

    it("trigger writes an audit event", () => {
      const triggerBlock = src.slice(
        src.indexOf("trigger:"),
        src.indexOf("cancel:"),
      );
      expect(triggerBlock).toContain("createAuditEvent");
    });
  });

  describe("cancel procedure conventions", () => {
    it("cancel checks state guard (only PENDING or RUNNING can be cancelled)", () => {
      const cancelBlock = src.slice(src.indexOf("cancel:"));
      expect(cancelBlock).toContain("CANNOT_CANCEL");
      expect(cancelBlock).toContain('"PENDING"');
      expect(cancelBlock).toContain('"RUNNING"');
    });

    it("cancel sets finishedAt to current time", () => {
      const cancelBlock = src.slice(src.indexOf("cancel:"));
      expect(cancelBlock).toContain("finishedAt: new Date()");
    });

    it("cancel records previousStatus in audit event", () => {
      const cancelBlock = src.slice(src.indexOf("cancel:"));
      expect(cancelBlock).toContain("previousStatus: existing.status");
    });

    it("cancel writes an audit event", () => {
      const cancelBlock = src.slice(src.indexOf("cancel:"));
      expect(cancelBlock).toContain("createAuditEvent");
    });
  });

  describe("scan list filters are allowlisted", () => {
    it("list supports scopeId filter", () => {
      expect(src).toContain("scopeId: z.string().optional()");
    });

    it("list supports tenantId filter", () => {
      expect(src).toContain("tenantId: z.string().optional()");
    });

    it("list supports status filter", () => {
      expect(src).toContain("status: scanStatus.optional()");
    });

    it("list supports triggeredBy filter", () => {
      expect(src).toContain("triggeredBy: scanTrigger.optional()");
    });
  });
});
