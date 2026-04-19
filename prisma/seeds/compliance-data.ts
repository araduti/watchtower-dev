// =============================================================================
// Watchtower — Compliance data seeder (checks, frameworks, controls, assertions)
// =============================================================================
//
// Orchestrates the full CIS M365 compliance catalog by delegating to
// `compliance-assertions.ts`, which loads every check spec from
// `docs/Assertions/*.ts` at seed time and emits:
//
//   Framework → Check → Control → ControlAssertion
//
// Additional non-CIS frameworks (ScubaGear, NIST CSF) are seeded here so they
// are available for cross-mapping if needed in future.
//
// This seeder is idempotent — safe to run repeatedly.
//
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import {
  seedComplianceAssertions,
  dryRunComplianceAssertions,
  type ComplianceSeedStats,
} from "./compliance-assertions";

// =============================================================================
// AUXILIARY FRAMEWORKS
// =============================================================================
// ScubaGear and NIST are seeded alongside the CIS catalog so future
// cross-mapping controls can reference them. No checks or assertions are
// generated for these frameworks here — they are added as needed.

type FrameworkSeed = {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  version: string;
  url: string | null;
};

const AUX_FRAMEWORKS: readonly FrameworkSeed[] = [
  {
    id: "fw-scubagear-m365-v1.5",
    slug: "scubagear-m365-v1.5",
    name: "ScubaGear M365 Security Baseline",
    publisher: "CISA",
    version: "1.5.0",
    url: "https://github.com/cisagov/ScubaGear",
  },
  {
    id: "fw-nist-csf-v2.0",
    slug: "nist-csf-v2.0",
    name: "NIST Cybersecurity Framework",
    publisher: "NIST",
    version: "2.0",
    url: "https://www.nist.gov/cyberframework",
  },
];

// These arrays are populated after seedComplianceData() runs and hold computed
// totals for the index.ts logger. The real catalog is produced dynamically by
// compliance-assertions.ts (loading docs/Assertions/*.ts at seed time).
//
// Primary CIS framework seeded: cis-m365-v6.0.1 ("CIS Microsoft 365 Foundations Benchmark", version "6.0.1")
// Also seeded: cis-m365-v3.0
export const CHECKS: { slug: string }[] = [];
export const FRAMEWORKS: { slug: string }[] = [];

// =============================================================================
// SEEDER IMPLEMENTATION
// =============================================================================

/**
 * Seed the full compliance catalog: frameworks, checks, controls, and assertions.
 * Delegates the CIS M365 catalog to compliance-assertions.ts, then seeds
 * auxiliary frameworks (ScubaGear, NIST).
 *
 * Returns total record count.
 */
export async function seedComplianceData(db: PrismaClient): Promise<number> {
  // 1. CIS M365 — loads all docs/Assertions/*.ts and emits all DB rows
  const stats: ComplianceSeedStats = await seedComplianceAssertions(db);

  // 2. Auxiliary frameworks
  for (const fw of AUX_FRAMEWORKS) {
    await db.framework.upsert({
      where: { id: fw.id },
      create: {
        id: fw.id,
        slug: fw.slug,
        name: fw.name,
        publisher: fw.publisher,
        version: fw.version,
        url: fw.url,
      },
      update: {
        name: fw.name,
        publisher: fw.publisher,
        version: fw.version,
        url: fw.url,
      },
    });
  }

  // Populate the exported arrays so index.ts logging shows real counts.
  CHECKS.length = 0;
  for (let i = 0; i < stats.checks; i++) CHECKS.push({ slug: `cis-check-${i}` });

  FRAMEWORKS.length = 0;
  for (let i = 0; i < stats.frameworks + AUX_FRAMEWORKS.length; i++) FRAMEWORKS.push({ slug: `fw-${i}` });

  return stats.frameworks + stats.checks + stats.controls + stats.assertions + AUX_FRAMEWORKS.length;
}

/**
 * Dry-run: report what would be created without writing.
 */
export async function dryRunComplianceData(): Promise<number> {
  const stats = await dryRunComplianceAssertions();
  const total = stats.frameworks + stats.checks + stats.controls + stats.assertions + AUX_FRAMEWORKS.length;

  console.log("  Would create / update:");
  console.log(`    • ${stats.frameworks + AUX_FRAMEWORKS.length} compliance frameworks`);
  console.log(`    • ${stats.checks} compliance checks`);
  console.log(`    • ${stats.controls} framework control mappings`);
  console.log(`    • ${stats.assertions} control assertions`);

  return total;
}
