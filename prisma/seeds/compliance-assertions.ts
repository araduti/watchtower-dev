// =============================================================================
// Watchtower — Compliance assertion seeder
// =============================================================================
//
// Loads declarative check specs from `docs/Assertions/*.ts` and emits the
// database records the scan pipeline needs to produce findings:
//
//   Framework → Check → Control → ControlAssertion
//
// The source of truth is the files in `docs/Assertions/`. This seeder is the
// single bridge between those curated specs and the Inngest-based scan
// pipeline. It is idempotent (upsert checks/controls, delete-and-recreate
// assertions so stale rows from renamed specs are removed).
//
// Spec shapes handled (see docs/Assertions for examples):
//   SIMPLE     {source, assert: {property, value}}               → operator "eq"
//   NOTEMPTY   {source, assert: {property, notEmpty}}            → operator "notEmpty"
//   ALSO       {source, assert: {property, value, also: [...]}}  → additionalAssertions JSON
//   ALLOWED    {source, assert: {property, allowedValues}}       → operator "allowedValues"
//   COUNT      {source, assert: {filter?, count: {min?, max?}}}  → operator "count"
//   CUSTOM     {custom: "evaluator-slug"}                        → operator "custom"
//   CA-MATCH   {match: {...}}                                     → operator "ca-match"
//   MANUAL     {manual: true}                                     → operator "manual"
//
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

// =============================================================================
// TYPES
// =============================================================================

type AssertionSpec = {
  id: string;
  framework?: string;
  frameworkVersion?: string;
  product?: string;
  title: string;
  requiresConnector?: string;
  requiresScope?: string;
  source?: string;
  assert?: Record<string, unknown>;
  custom?: string;
  match?: Record<string, unknown>;
  manual?: boolean;
  part?: number;
  groupId?: string;
};

type LoadedSpec = {
  spec: AssertionSpec;
  filename: string;
  /** Version extracted from filename prefix — authoritative over in-body frameworkVersion */
  fileVersion: string;
  /** Stable localId: spec.id for most files; filename suffix for part-split files */
  localId: string;
};

type AssertionRow = {
  /** Control FK */
  controlCheckSlug: string;
  controlFrameworkId: string;
  controlControlId: string;
  /** Engine fields */
  checkSlug: string;
  operator: string;
  expectedValue: Prisma.InputJsonValue | null;
  sourceFilter: Prisma.InputJsonValue | null;
  source: string | null;
  property: string | null;
  assertionLogic: "ALL" | "ANY";
  evaluatorSlug: string | null;
  additionalAssertions: Prisma.InputJsonValue | null;
  nestedFind: Prisma.InputJsonValue | null;
};

type ControlEntry = {
  checkSlug: string;
  frameworkId: string;
  controlId: string;
  controlTitle: string;
};

type CheckEntry = {
  slug: string;
  title: string;
  dataSource: string | null;
  property: string | null;
  product: string;
  connectors: string[];
};

type BuiltCatalog = {
  frameworks: Map<string, { id: string; slug: string; version: string }>;
  checks: Map<string, CheckEntry>;
  controls: ControlEntry[];
  assertions: AssertionRow[];
};

// =============================================================================
// FILE LOADING
// =============================================================================

const ASSERTIONS_DIR = join(import.meta.dir, "..", "..", "docs", "Assertions");
const FILENAME_RE = /^cis-m365-([0-9.]+)-(.+)\.ts$/;

async function loadAssertionFiles(): Promise<LoadedSpec[]> {
  const entries = await readdir(ASSERTIONS_DIR);
  const files = entries.filter((f) => f.endsWith(".ts")).sort();
  const loaded: LoadedSpec[] = [];

  for (const filename of files) {
    const m = FILENAME_RE.exec(filename);
    if (!m) {
      console.warn(`  ⚠ skipping unrecognized filename: ${filename}`);
      continue;
    }
    const fileVersion = m[1]!;
    const fileSuffix = m[2]!;

    const mod = await import(join(ASSERTIONS_DIR, filename));
    const raw: unknown = mod.default;
    const specs: AssertionSpec[] = Array.isArray(raw) ? (raw as AssertionSpec[]) : [raw as AssertionSpec];

    for (const spec of specs) {
      if (!spec || typeof spec !== "object" || !spec.id) {
        console.warn(`  ⚠ ${filename}: skipping spec without id`);
        continue;
      }
      // When a file encodes multiple logical parts of one control (same id,
      // different `part` field), the filename suffix ("1.3.4a" vs "1.3.4b")
      // becomes the localId so each is a separate Check and Control row.
      // Array-exported files already use unique ids per entry (e.g. "6.2.1a").
      const localId = Array.isArray(raw) ? spec.id : typeof spec.part === "number" ? fileSuffix : spec.id;

      loaded.push({ spec, filename, fileVersion, localId });
    }
  }
  return loaded;
}

// =============================================================================
// SPEC → ROWS TRANSLATION
// =============================================================================

function makeCheckSlug(fileVersion: string, localId: string): string {
  return `cis.m365.v${fileVersion}.${localId}`;
}

function makeFrameworkId(fileVersion: string): string {
  return `fw-cis-m365-v${fileVersion}`;
}

function connectorOf(spec: AssertionSpec): string[] {
  if (spec.requiresConnector) return [spec.requiresConnector];
  return ["microsoft-graph"];
}

type SubAssertion = { property: string; operator: string; expectedValue: unknown };

function subAssertionFromAlso(item: Record<string, unknown>): SubAssertion | null {
  const property = item.property as string | undefined;
  if (!property) return null;
  if ("value" in item) return { property, operator: "eq", expectedValue: item.value };
  if ("notEmpty" in item) return { property, operator: "notEmpty", expectedValue: item.notEmpty };
  if ("min" in item) return { property, operator: "gte", expectedValue: item.min };
  if ("max" in item) return { property, operator: "lte", expectedValue: item.max };
  return null;
}

function translateSpec(loaded: LoadedSpec): AssertionRow[] {
  const { spec, fileVersion, localId } = loaded;
  const checkSlug = makeCheckSlug(fileVersion, localId);
  const frameworkId = makeFrameworkId(fileVersion);

  const controlKey = {
    controlCheckSlug: checkSlug,
    controlFrameworkId: frameworkId,
    controlControlId: spec.id,
  };

  const base: Pick<AssertionRow, "controlCheckSlug" | "controlFrameworkId" | "controlControlId" | "checkSlug" | "assertionLogic"> = {
    ...controlKey,
    checkSlug,
    assertionLogic: "ALL",
  };

  const empty: Omit<AssertionRow, keyof typeof base> = {
    operator: "manual",
    expectedValue: null,
    sourceFilter: null,
    source: null,
    property: null,
    evaluatorSlug: null,
    additionalAssertions: null,
    nestedFind: null,
  };

  // MANUAL
  if (spec.manual === true) {
    return [{ ...base, ...empty, operator: "manual" }];
  }

  // CUSTOM evaluator
  if (typeof spec.custom === "string") {
    return [{ ...base, ...empty, operator: "custom", source: spec.source ?? null, evaluatorSlug: spec.custom }];
  }

  // CA-MATCH
  if (spec.match && typeof spec.match === "object") {
    return [{
      ...base, ...empty,
      operator: "ca-match",
      expectedValue: spec.match as Prisma.InputJsonValue,
      source: spec.source ?? "caPolicies",
    }];
  }

  // Needs an assert block + source
  const assertBlock = spec.assert;
  const source = spec.source ?? null;
  if (!assertBlock || typeof assertBlock !== "object" || !source) {
    console.warn(`  ⚠ ${loaded.filename}: no translatable shape — emitting manual`);
    return [{ ...base, ...empty }];
  }

  const a = assertBlock as Record<string, unknown>;
  const sourceFilter = a.filter ? (a.filter as Prisma.InputJsonValue) : null;

  // COUNT
  if (a.count && typeof a.count === "object") {
    return [{
      ...base, ...empty,
      operator: "count",
      expectedValue: a.count as Prisma.InputJsonValue,
      source,
      sourceFilter,
    }];
  }

  const property = a.property as string | undefined;
  if (!property) {
    console.warn(`  ⚠ ${loaded.filename}: assert block missing property`);
    return [];
  }

  // ALLOWED VALUES
  if (Array.isArray(a.allowedValues)) {
    return [{
      ...base, ...empty,
      operator: "allowedValues",
      expectedValue: a.allowedValues as Prisma.InputJsonValue,
      property,
      source,
      sourceFilter,
    }];
  }

  // Primary operator
  let operator: string;
  let expectedValue: unknown;
  if ("value" in a) {
    operator = "eq";
    expectedValue = a.value;
  } else if ("notEmpty" in a) {
    operator = "notEmpty";
    expectedValue = a.notEmpty;
  } else if ("min" in a) {
    // Top-level min: assert property >= min (e.g. {property: "count", min: 2})
    operator = "gte";
    expectedValue = a.min;
  } else if ("max" in a) {
    // Top-level max: assert property <= max (e.g. {property: "userDeviceQuota", max: 20})
    operator = "lte";
    expectedValue = a.max;
  } else {
    console.warn(`  ⚠ ${loaded.filename}: unknown assert shape — no value/notEmpty/min/max found`);
    return [];
  }

  // ALSO → inline additionalAssertions JSON column
  let additional: SubAssertion[] | null = null;
  if (Array.isArray(a.also)) {
    additional = [];
    for (const item of a.also) {
      if (!item || typeof item !== "object") continue;
      const sub = subAssertionFromAlso(item as Record<string, unknown>);
      if (sub) additional.push(sub);
    }
    if (additional.length === 0) additional = null;
  }

  return [{
    ...base, ...empty,
    operator,
    expectedValue: (expectedValue ?? null) as Prisma.InputJsonValue | null,
    property,
    source,
    sourceFilter,
    additionalAssertions: additional as unknown as Prisma.InputJsonValue | null,
  }];
}

// =============================================================================
// CATALOG ASSEMBLY
// =============================================================================

function buildCatalog(loaded: LoadedSpec[]): BuiltCatalog {
  const frameworks = new Map<string, { id: string; slug: string; version: string }>();
  const checks = new Map<string, CheckEntry>();
  const controls: ControlEntry[] = [];
  const assertions: AssertionRow[] = [];

  for (const entry of loaded) {
    const { spec, fileVersion, localId } = entry;
    const checkSlug = makeCheckSlug(fileVersion, localId);
    const frameworkId = makeFrameworkId(fileVersion);

    // Framework
    if (!frameworks.has(frameworkId)) {
      frameworks.set(frameworkId, { id: frameworkId, slug: `cis-m365-v${fileVersion}`, version: fileVersion });
    }

    // Check (first definition wins for dedup)
    if (!checks.has(checkSlug)) {
      const a = spec.assert as Record<string, unknown> | undefined;
      checks.set(checkSlug, {
        slug: checkSlug,
        title: spec.title,
        dataSource: spec.source ?? null,
        property: typeof a?.property === "string" ? a.property : null,
        product: spec.product ?? "M365",
        connectors: connectorOf(spec),
      });
    }

    // Control
    controls.push({ checkSlug, frameworkId, controlId: spec.id, controlTitle: spec.title });

    // Assertions
    for (const row of translateSpec(entry)) {
      assertions.push(row);
    }
  }

  return { frameworks, checks, controls, assertions };
}

// =============================================================================
// DB WRITES
// =============================================================================

async function upsertFrameworks(db: PrismaClient, catalog: BuiltCatalog): Promise<void> {
  for (const fw of catalog.frameworks.values()) {
    await db.framework.upsert({
      where: { id: fw.id },
      create: {
        id: fw.id,
        slug: fw.slug,
        name: `CIS Microsoft 365 Foundations Benchmark v${fw.version}`,
        publisher: "CIS",
        version: fw.version,
        url: "https://www.cisecurity.org/benchmark/microsoft_365",
      },
      update: {
        slug: fw.slug,
        name: `CIS Microsoft 365 Foundations Benchmark v${fw.version}`,
        version: fw.version,
      },
    });
  }
}

/**
 * Upsert checks and return a map of slug → DB id (cuid).
 * The Control model requires `checkId` (FK to Check.id), so we capture it here.
 */
async function upsertChecks(
  db: PrismaClient,
  catalog: BuiltCatalog,
): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();

  for (const chk of catalog.checks.values()) {
    // slug+version is the compound unique key on Check
    const row = await db.check.upsert({
      where: { slug_version: { slug: chk.slug, version: 1 } },
      create: {
        slug: chk.slug,
        version: 1,
        title: chk.title,
        description: chk.title,   // placeholder — can be enriched later
        rationale: "",
        remediation: "",
        severity: "MEDIUM",
        severityRank: 2,
        source: "BUILTIN",
        graphScopes: [],
        dataSource: chk.dataSource,
        property: chk.property,
        product: chk.product,
        connectors: chk.connectors,
        allowedValues: Prisma.JsonNull,
        allowedOperators: [],
      },
      update: {
        title: chk.title,
        dataSource: chk.dataSource,
        property: chk.property,
        product: chk.product,
        connectors: chk.connectors,
      },
      select: { id: true, slug: true },
    });
    slugToId.set(row.slug, row.id);
  }

  return slugToId;
}

async function upsertControls(
  db: PrismaClient,
  catalog: BuiltCatalog,
  slugToId: Map<string, string>,
): Promise<void> {
  for (const ctrl of catalog.controls) {
    const checkId = slugToId.get(ctrl.checkSlug);
    if (!checkId) {
      console.warn(`  ⚠ no checkId found for slug ${ctrl.checkSlug} — skipping control`);
      continue;
    }
    await db.control.upsert({
      where: {
        checkSlug_frameworkId_controlId: {
          checkSlug: ctrl.checkSlug,
          frameworkId: ctrl.frameworkId,
          controlId: ctrl.controlId,
        },
      },
      create: {
        checkSlug: ctrl.checkSlug,
        checkId,
        frameworkId: ctrl.frameworkId,
        controlId: ctrl.controlId,
        controlTitle: ctrl.controlTitle,
        classification: null,
        required: true,
        automated: true,
      },
      update: {
        checkId,
        controlTitle: ctrl.controlTitle,
      },
    });
  }
}

async function replaceAssertions(db: PrismaClient, catalog: BuiltCatalog): Promise<number> {
  // Group assertion rows by their control composite key
  type ControlKey = string;
  const byControl = new Map<ControlKey, AssertionRow[]>();

  for (const row of catalog.assertions) {
    const key = `${row.controlCheckSlug}|${row.controlFrameworkId}|${row.controlControlId}`;
    const list = byControl.get(key) ?? [];
    list.push(row);
    byControl.set(key, list);
  }

  let n = 0;
  for (const [key, rows] of byControl) {
    const [checkSlug, frameworkId, controlId] = key.split("|") as [string, string, string];

    // Delete stale rows for this control, then insert fresh
    await db.controlAssertion.deleteMany({
      where: { controlCheckSlug: checkSlug, controlFrameworkId: frameworkId, controlControlId: controlId },
    });

    for (const row of rows) {
      await db.controlAssertion.create({
        data: {
          controlCheckSlug: row.controlCheckSlug,
          controlFrameworkId: row.controlFrameworkId,
          controlControlId: row.controlControlId,
          checkSlug: row.checkSlug,
          operator: row.operator,
          expectedValue: row.expectedValue ?? Prisma.JsonNull,
          sourceFilter: row.sourceFilter ?? Prisma.JsonNull,
          source: row.source,
          property: row.property,
          assertionLogic: row.assertionLogic,
          evaluatorSlug: row.evaluatorSlug,
          additionalAssertions: row.additionalAssertions ?? Prisma.JsonNull,
          nestedFind: row.nestedFind ?? Prisma.JsonNull,
        },
      });
      n++;
    }
  }
  return n;
}

/**
 * Remove ControlAssertions, Controls, and orphaned Checks that were seeded
 * by a previous run but are no longer in the current docs/Assertions catalog.
 *
 * Scope: only touches slugs starting with "cis.m365.v" so we never
 * accidentally delete manually-curated or customer-added records.
 */
async function purgeStaleEntries(db: PrismaClient, catalog: BuiltCatalog): Promise<void> {
  const CIS_PREFIX = "cis.m365.v";

  // Build the set of (checkSlug, frameworkId, controlId) triples that are
  // still valid according to the current catalog.
  const validControlKeys = new Set<string>(
    catalog.controls.map((c) => `${c.checkSlug}|${c.frameworkId}|${c.controlId}`),
  );
  const validCheckSlugs = new Set<string>(catalog.checks.keys());

  // 1. Find all cis.m365.v* Controls currently in the DB.
  const dbControls = await db.control.findMany({
    where: { checkSlug: { startsWith: CIS_PREFIX } },
    select: { checkSlug: true, frameworkId: true, controlId: true },
  });

  // 2. For each Control no longer in the catalog: delete its assertions, then the Control.
  for (const ctrl of dbControls) {
    const key = `${ctrl.checkSlug}|${ctrl.frameworkId}|${ctrl.controlId}`;
    if (validControlKeys.has(key)) continue;

    await db.controlAssertion.deleteMany({
      where: {
        controlCheckSlug: ctrl.checkSlug,
        controlFrameworkId: ctrl.frameworkId,
        controlControlId: ctrl.controlId,
      },
    });
    await db.control.delete({
      where: {
        checkSlug_frameworkId_controlId: {
          checkSlug: ctrl.checkSlug,
          frameworkId: ctrl.frameworkId,
          controlId: ctrl.controlId,
        },
      },
    });
    console.warn(`  ♻ purged stale control ${ctrl.controlId} (${ctrl.checkSlug})`);
  }

  // 3. Delete orphaned Checks (cis.m365.v* with no remaining Controls).
  const dbChecks = await db.check.findMany({
    where: { slug: { startsWith: CIS_PREFIX } },
    select: { id: true, slug: true },
  });

  for (const chk of dbChecks) {
    if (validCheckSlugs.has(chk.slug)) continue;

    // Safety guard: only delete if no controls remain (the loop above may
    // have already removed them, but be explicit in case of partial runs).
    const remainingControls = await db.control.count({ where: { checkSlug: chk.slug } });
    if (remainingControls > 0) continue;

    await db.check.delete({ where: { id: chk.id } });
    console.warn(`  ♻ purged orphaned check ${chk.slug}`);
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

export type ComplianceSeedStats = {
  frameworks: number;
  checks: number;
  controls: number;
  assertions: number;
};

export async function seedComplianceAssertions(db: PrismaClient): Promise<ComplianceSeedStats> {
  const loaded = await loadAssertionFiles();
  const catalog = buildCatalog(loaded);

  // Upsert current catalog
  await upsertFrameworks(db, catalog);
  const slugToId = await upsertChecks(db, catalog);
  await upsertControls(db, catalog, slugToId);
  const assertions = await replaceAssertions(db, catalog);

  // Remove rows for specs that were renamed or deleted since the last seed
  await purgeStaleEntries(db, catalog);

  return {
    frameworks: catalog.frameworks.size,
    checks: catalog.checks.size,
    controls: catalog.controls.length,
    assertions,
  };
}

export async function dryRunComplianceAssertions(): Promise<ComplianceSeedStats> {
  const loaded = await loadAssertionFiles();
  const catalog = buildCatalog(loaded);

  // Count how many assertion rows would be written
  let assertions = 0;
  for (const loaded of []) {
    // (not executed — counted via catalog)
    void loaded;
  }
  assertions = catalog.assertions.length;

  return {
    frameworks: catalog.frameworks.size,
    checks: catalog.checks.size,
    controls: catalog.controls.length,
    assertions,
  };
}
