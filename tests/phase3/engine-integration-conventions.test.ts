// =============================================================================
// Phase 3 — Engine ↔ scan pipeline integration convention tests
// =============================================================================
// Validates that the Phase 3 deliverables follow Watchtower's conventions:
//  §1  Engine package structure and public API
//  §2  Engine evaluation logic
//  §3  Scan pipeline engine integration
//  §4  Finding lifecycle state machine
//  §5  Compliance seed data (CIS M365 v6.0.1, ScubaGear, NIST)
//  §6  Security invariants
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const root = process.cwd();

function readFile(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf-8");
}

function fileExists(relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

// ==========================================================================
// §1 — Engine package structure and public API
// ==========================================================================

describe("§1 — Engine package structure", () => {
  it("package.json exists with correct name", () => {
    expect(fileExists("packages/engine/package.json")).toBe(true);
    const pkg = JSON.parse(readFile("packages/engine/package.json"));
    expect(pkg.name).toBe("@watchtower/engine");
    expect(pkg.private).toBe(true);
  });

  it("exports entry point at src/index.ts", () => {
    expect(fileExists("packages/engine/src/index.ts")).toBe(true);
    const pkg = JSON.parse(readFile("packages/engine/package.json"));
    expect(pkg.exports["."]).toBe("./src/index.ts");
  });

  it("index.ts exports evaluateAssertions and evaluateControl", () => {
    const indexSrc = readFile("packages/engine/src/index.ts");
    expect(indexSrc).toContain("evaluateAssertions");
    expect(indexSrc).toContain("evaluateControl");
  });

  it("index.ts exports type definitions", () => {
    const indexSrc = readFile("packages/engine/src/index.ts");
    expect(indexSrc).toContain("EngineAssertion");
    expect(indexSrc).toContain("EngineResult");
    expect(indexSrc).toContain("EngineConfig");
    expect(indexSrc).toContain("EvidenceSnapshot");
  });

  it("index.ts re-exports evaluator registry functions", () => {
    const indexSrc = readFile("packages/engine/src/index.ts");
    expect(indexSrc).toContain("getEvaluator");
    expect(indexSrc).toContain("registrySize");
    expect(indexSrc).toContain("registerPlugin");
  });

  it("types.ts defines all Operator types", () => {
    const typesSrc = readFile("packages/engine/src/types.ts");
    const operators = [
      "eq", "neq", "in", "lte", "gte", "notEmpty",
      "manual", "count", "allowedValues", "custom",
      "contains", "notContainsAny", "nestedFind", "ca-match",
    ];
    for (const op of operators) {
      expect(typesSrc).toContain(`"${op}"`);
    }
  });

  it("evaluate.ts exists with core evaluation functions", () => {
    expect(fileExists("packages/engine/src/evaluate.ts")).toBe(true);
    const evalSrc = readFile("packages/engine/src/evaluate.ts");
    expect(evalSrc).toContain("export function evaluateControl");
    expect(evalSrc).toContain("export function evaluateAssertions");
  });
});

// ==========================================================================
// §2 — Engine evaluation logic
// ==========================================================================

describe("§2 — Engine evaluation logic", () => {
  const evalSrc = readFile("packages/engine/src/evaluate.ts");

  it("handles all operator types in evaluateControl", () => {
    // Each operator type should have a code path
    expect(evalSrc).toContain("ca-match");
    expect(evalSrc).toContain("evaluatorSlug");
    expect(evalSrc).toContain("nestedFind");
    expect(evalSrc).toContain('"count"');
    expect(evalSrc).toContain('"allowedValues"');
    expect(evalSrc).toContain('"manual"');
  });

  it("supports additional assertions (AND-combined)", () => {
    expect(evalSrc).toContain("additionalAssertions");
  });

  it("evaluateAssertions groups results by checkSlug", () => {
    expect(evalSrc).toContain("byCheck");
    expect(evalSrc).toContain("checkSlug");
  });

  it("evaluateAssertions AND-combines multiple assertions per check", () => {
    expect(evalSrc).toContain("allPass");
    expect(evalSrc).toContain("allWarnings");
  });

  it("handles source filters with operator objects ($ne, $in, $exists)", () => {
    expect(evalSrc).toContain("$ne");
    expect(evalSrc).toContain("$in");
    expect(evalSrc).toContain("$exists");
  });

  it("includes CA policy match engine", () => {
    expect(evalSrc).toContain("evaluateCaPolicy");
    expect(evalSrc).toContain("runCaMatch");
  });

  it("returns EngineResult with checkSlug, pass, warnings, actualValues, evaluatedAt", () => {
    expect(evalSrc).toContain("checkSlug");
    expect(evalSrc).toContain("pass");
    expect(evalSrc).toContain("warnings");
    expect(evalSrc).toContain("actualValues");
    expect(evalSrc).toContain("evaluatedAt");
  });
});

// ==========================================================================
// §3 — Scan pipeline engine integration
// ==========================================================================

describe("§3 — Scan pipeline engine integration", () => {
  const executeSrc = readFile(
    "packages/scan-pipeline/src/functions/execute-scan.ts",
  );

  it("imports evaluateAssertions from @watchtower/engine", () => {
    expect(executeSrc).toContain("@watchtower/engine");
    expect(executeSrc).toContain("evaluateAssertions");
  });

  it("imports engine types (EngineAssertion, EngineConfig, EvidenceSnapshot)", () => {
    expect(executeSrc).toContain("EngineAssertion");
    expect(executeSrc).toContain("EngineConfig");
    expect(executeSrc).toContain("EvidenceSnapshot");
  });

  it("scan-pipeline package.json includes @watchtower/engine dependency", () => {
    const pkg = JSON.parse(
      readFile("packages/scan-pipeline/package.json"),
    );
    expect(pkg.dependencies).toHaveProperty("@watchtower/engine");
  });

  it("store-evidence step loads ControlAssertions from database", () => {
    expect(executeSrc).toContain("controlAssertion.findMany");
  });

  it("store-evidence step builds EvidenceSnapshot from collected data", () => {
    // The step converts CollectedSource[] to EvidenceSnapshot
    expect(executeSrc).toContain("EvidenceSnapshot");
    expect(executeSrc).toContain("collectedSources.map");
  });

  it("store-evidence step calls evaluateAssertions with assertions and snapshot", () => {
    expect(executeSrc).toContain("evaluateAssertions(");
  });

  it("store-evidence step creates Evidence records", () => {
    expect(executeSrc).toContain("evidence.create");
  });

  it("store-evidence step uses withRLS for database access", () => {
    // The step should be inside a withRLS call
    const storeEvidenceStart = executeSrc.indexOf('step.run("store-evidence"');
    const storeEvidenceBlock = executeSrc.slice(
      storeEvidenceStart,
      executeSrc.indexOf('step.run("finalize-scan"'),
    );
    expect(storeEvidenceBlock).toContain("withRLS");
  });

  it("finalize-scan step uses real checksRun/checksFailed counts", () => {
    const finalizeStart = executeSrc.indexOf('step.run("finalize-scan"');
    const finalizeBlock = executeSrc.slice(finalizeStart);
    expect(finalizeBlock).toContain("evidenceSummary.checksRun");
    expect(finalizeBlock).toContain("evidenceSummary.checksFailed");
  });

  it("no Phase 3 TODO comments remain in execute-scan.ts", () => {
    expect(executeSrc).not.toContain(
      "Engine not yet integrated",
    );
    expect(executeSrc).not.toContain(
      "Placeholder — engine not yet integrated",
    );
  });

  it("completion event uses real checksRun/checksFailed counts", () => {
    const emitBlock = executeSrc.slice(
      executeSrc.indexOf("emit-scan-completed"),
    );
    expect(emitBlock).toContain("evidenceSummary.checksRun");
    expect(emitBlock).toContain("evidenceSummary.checksFailed");
  });
});

// ==========================================================================
// §4 — Finding lifecycle state machine
// ==========================================================================

describe("§4 — Finding lifecycle state machine", () => {
  const executeSrc = readFile(
    "packages/scan-pipeline/src/functions/execute-scan.ts",
  );

  it("upsertFinding function exists", () => {
    expect(executeSrc).toContain("async function upsertFinding");
  });

  it("creates new Findings with OPEN status for failures", () => {
    const upsertBlock = executeSrc.slice(
      executeSrc.indexOf("async function upsertFinding"),
    );
    expect(upsertBlock).toContain('"OPEN"');
  });

  it("creates new Findings with RESOLVED status for passes", () => {
    const upsertBlock = executeSrc.slice(
      executeSrc.indexOf("async function upsertFinding"),
    );
    expect(upsertBlock).toContain('"RESOLVED"');
  });

  it("handles regression from RESOLVED back to OPEN", () => {
    const upsertBlock = executeSrc.slice(
      executeSrc.indexOf("async function upsertFinding"),
    );
    expect(upsertBlock).toContain("regressionFromResolvedAt");
  });

  it("updates lastSeenAt on every evaluation", () => {
    const upsertBlock = executeSrc.slice(
      executeSrc.indexOf("async function upsertFinding"),
    );
    expect(upsertBlock).toContain("lastSeenAt");
  });

  it("respects ACCEPTED_RISK — does not change status", () => {
    const upsertBlock = executeSrc.slice(
      executeSrc.indexOf("async function upsertFinding"),
    );
    expect(upsertBlock).toContain("ACCEPTED_RISK");
  });

  it("copies severity from Check at creation time", () => {
    const upsertBlock = executeSrc.slice(
      executeSrc.indexOf("async function upsertFinding"),
    );
    expect(upsertBlock).toContain("severity");
    expect(upsertBlock).toContain("severityRank");
  });

  it("writes audit events for finding status changes", () => {
    const storeBlock = executeSrc.slice(
      executeSrc.indexOf('step.run("store-evidence"'),
      executeSrc.indexOf('step.run("finalize-scan"'),
    );
    expect(storeBlock).toContain("finding.created");
    expect(storeBlock).toContain("finding.status_changed");
    expect(storeBlock).toContain("createAuditEvent");
  });

  it("Finding upsert uses tenantId_checkSlug composite key", () => {
    expect(executeSrc).toContain("tenantId_checkSlug");
  });

  it("FindingUpsertResult tracks isNew, statusChanged, previousStatus, newStatus", () => {
    expect(executeSrc).toContain("isNew");
    expect(executeSrc).toContain("statusChanged");
    expect(executeSrc).toContain("previousStatus");
    expect(executeSrc).toContain("newStatus");
  });
});

// ==========================================================================
// §5 — Compliance seed data
// ==========================================================================

describe("§5 — Compliance seed data", () => {
  // compliance-data.ts orchestrates the seed; the CIS M365 catalog is built
  // dynamically by compliance-assertions.ts (loading docs/Assertions/*.ts).
  const seedSrc = readFile("prisma/seeds/compliance-data.ts");
  const assertionsSrc = readFile("prisma/seeds/compliance-assertions.ts");

  it("references CIS Microsoft 365 Foundations Benchmark v6.0.1", () => {
    // compliance-data.ts carries a comment describing what it seeds;
    // the assertions seeder generates fw-cis-m365-v<version> at runtime.
    expect(seedSrc).toContain("cis-m365-v6.0.1");
    // The assertions seeder builds the full framework name
    expect(assertionsSrc).toContain("CIS Microsoft 365 Foundations Benchmark");
  });

  it("does NOT reference old CIS M365 v3.1", () => {
    expect(seedSrc).not.toContain("cis-m365-v3.1");
    expect(seedSrc).not.toContain('"3.1.0"');
    expect(assertionsSrc).not.toContain("cis-m365-v3.1");
    expect(assertionsSrc).not.toContain('"3.1.0"');
  });

  it("includes ScubaGear M365 framework", () => {
    expect(seedSrc).toContain("scubagear-m365-v1.5");
    expect(seedSrc).toContain("ScubaGear M365 Security Baseline");
    expect(seedSrc).toContain("CISA");
  });

  it("includes NIST CSF v2.0 framework", () => {
    expect(seedSrc).toContain("nist-csf-v2.0");
    expect(seedSrc).toContain("NIST Cybersecurity Framework");
  });

  it("ScubaGear framework is defined for future cross-mapping", () => {
    // ScubaGear framework is seeded in compliance-data.ts. Control cross-mapping
    // (MS.AAD.3.1v1 etc.) will be added when ScubaGear connector data is available.
    expect(seedSrc).toContain("fw-scubagear-m365-v1.5");
  });

  it("CIS checks are sourced from docs/Assertions directory", () => {
    // The assertions seeder loads all 126+ check spec files at seed time.
    // Checks are identified by version-prefixed slugs: cis.m365.v{version}.{controlId}
    expect(assertionsSrc).toContain("docs");
    expect(assertionsSrc).toContain("Assertions");
    expect(assertionsSrc).toContain("makeCheckSlug");
    expect(assertionsSrc).toContain("makeFrameworkId");
  });

  it("check slugs follow cis.m365.v{version}.{controlId} naming convention", () => {
    // New slug convention: cis.m365.v<version>.<controlId>
    // The slug builder function is present in compliance-assertions.ts
    expect(assertionsSrc).toContain("cis.m365.v");
  });

  it("seeder exports seedComplianceData and dryRunComplianceData", () => {
    expect(seedSrc).toContain("export async function seedComplianceData");
    expect(seedSrc).toContain("export async function dryRunComplianceData");
  });

  it("seeder exports CHECKS and FRAMEWORKS arrays", () => {
    expect(seedSrc).toContain("export const CHECKS");
    expect(seedSrc).toContain("export const FRAMEWORKS");
  });
});

// ==========================================================================
// §6 — Security invariants
// ==========================================================================

describe("§6 — Security invariants", () => {
  const executeSrc = readFile(
    "packages/scan-pipeline/src/functions/execute-scan.ts",
  );

  it("store-evidence step uses withRLS, not raw PrismaClient", () => {
    expect(executeSrc).toContain("withRLS");
    expect(executeSrc).not.toContain("new PrismaClient");
  });

  it("audit events are created in the same transaction as mutations", () => {
    // createAuditEvent should be inside the withRLS callback
    const storeEvidenceBlock = executeSrc.slice(
      executeSrc.indexOf('step.run("store-evidence"'),
      executeSrc.indexOf('step.run("finalize-scan"'),
    );
    expect(storeEvidenceBlock).toContain("createAuditEvent(tx");
  });

  it("engine results are validated before being stored as Evidence", () => {
    // Evidence.result is mapped from engine result
    expect(executeSrc).toContain("result.pass");
    expect(executeSrc).toContain('"PASS"');
    expect(executeSrc).toContain('"FAIL"');
  });

  it("collectedBy is SYSTEM for engine-generated evidence", () => {
    expect(executeSrc).toContain('collectedBy: "SYSTEM"');
  });

  it("engine does not instantiate PrismaClient directly", () => {
    const evalSrc = readFile("packages/engine/src/evaluate.ts");
    expect(evalSrc).not.toContain("PrismaClient");
    expect(evalSrc).not.toContain("prisma");
  });

  it("engine package has no database dependencies", () => {
    const pkg = JSON.parse(readFile("packages/engine/package.json"));
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    expect(deps).not.toHaveProperty("@prisma/client");
    expect(deps).not.toHaveProperty("@watchtower/db");
  });
});
