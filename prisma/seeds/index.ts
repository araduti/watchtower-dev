// =============================================================================
// Watchtower — Seed runner
// =============================================================================
//
// Orchestrates all seeders. Safe to run on every deploy. Idempotent.
//
// Usage:
//   bun run db:seed                    # apply all seeds
//   bun run db:seed -- --dry-run       # validate without writing
//   bun run db:seed -- --only=permissions  # run only one seeder
//   bun run db:seed -- --force         # required in production
//
// Environment safety:
//   - In production, --force is required (prevents accidental runs).
//   - In dry-run mode, every seeder reports what it would do without writing.
//
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  LOCKED_PERMISSION_KEYS,
  SEED_VERSION,
  upsertPermissions,
  upsertSystemRoles,
} from "./permissions";

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

type CliFlags = {
  dryRun: boolean;
  force: boolean;
  only: string | null;
  help: boolean;
};

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    dryRun: false,
    force: false,
    only: null,
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg.startsWith("--only=")) flags.only = arg.slice("--only=".length);
  }
  return flags;
}

function printHelp(): void {
  console.log(`
Watchtower seed runner

Usage:
  bun run db:seed                          Apply all seeds
  bun run db:seed -- --dry-run             Validate without writing
  bun run db:seed -- --only=<seeder>       Run only one seeder
  bun run db:seed -- --force               Required in production

Available seeders:
  permissions    Permission catalog and locked list
  roles          System role presets (Owner, Admin, Compliance Officer, Auditor)

Examples:
  bun run db:seed -- --dry-run
  bun run db:seed -- --only=permissions
  NODE_ENV=production bun run db:seed -- --force
`);
}

// =============================================================================
// LOGGING
// =============================================================================
// Structured-ish but human-readable. The seed runner is not a hot path; we
// optimize for clarity over performance.

const log = {
  step: (msg: string) => console.log(`\n▸ ${msg}`),
  info: (msg: string) => console.log(`  ${msg}`),
  ok: (msg: string) => console.log(`  ✓ ${msg}`),
  warn: (msg: string) => console.warn(`  ⚠ ${msg}`),
  err: (msg: string) => console.error(`  ✗ ${msg}`),
  divider: () => console.log("─".repeat(60)),
};

// =============================================================================
// ENVIRONMENT SAFETY
// =============================================================================

function assertSafeToRun(flags: CliFlags): void {
  const env = process.env.NODE_ENV ?? "development";

  if (env === "production" && !flags.force && !flags.dryRun) {
    log.err("Refusing to seed production without --force flag.");
    log.err("Production seed runs must be explicit:");
    log.err("  NODE_ENV=production bun run db:seed -- --force");
    process.exit(1);
  }

  if (env === "production" && flags.force) {
    log.warn("Running in PRODUCTION with --force.");
    log.warn("This will overwrite system roles and permissions.");
    log.warn("Custom roles and memberships are not affected.");
  }

  if (flags.dryRun) {
    log.warn("DRY RUN — no changes will be written to the database.");
  }
}

// =============================================================================
// SEEDERS REGISTRY
// =============================================================================
// Each seeder has a name (matchable via --only), a description, and a run
// function that takes the Prisma client and returns the number of records
// affected. Seeders are run in declaration order; dependencies must be
// listed before their dependents.

type Seeder = {
  name: string;
  description: string;
  run: (db: PrismaClient) => Promise<number>;
  // dryRun returns the count it would have written without doing it.
  dryRun: (db: PrismaClient) => Promise<number>;
};

const SEEDERS: readonly Seeder[] = [
  {
    name: "permissions",
    description: "Permission catalog and locked list",
    run: async (db) => {
      const count = await upsertPermissions(db);
      log.info(`${LOCKED_PERMISSION_KEYS.length} permissions are locked to system roles:`);
      for (const key of LOCKED_PERMISSION_KEYS) {
        log.info(`  • ${key}`);
      }
      return count;
    },
    dryRun: async () => {
      log.info(`Would upsert ${PERMISSIONS.length} permissions.`);
      log.info(`${LOCKED_PERMISSION_KEYS.length} would be locked:`);
      for (const key of LOCKED_PERMISSION_KEYS) {
        log.info(`  • ${key}`);
      }
      return PERMISSIONS.length;
    },
  },
  {
    name: "roles",
    description: "System role presets",
    run: async (db) => {
      const count = await upsertSystemRoles(db);
      for (const role of SYSTEM_ROLES) {
        log.info(`${role.name} (${role.slug}): ${role.permissions.length} permissions`);
      }
      return count;
    },
    dryRun: async () => {
      log.info(`Would upsert ${SYSTEM_ROLES.length} system roles:`);
      for (const role of SYSTEM_ROLES) {
        log.info(`  • ${role.name} (${role.slug}): ${role.permissions.length} permissions`);
      }
      return SYSTEM_ROLES.length;
    },
  },
];

// =============================================================================
// VALIDATION
// =============================================================================
// Pre-flight checks that catch the obvious mistakes BEFORE any DB writes.
// These are pure data checks — no DB access required.

function validate(): void {
  log.step("Validating seed data");

  const errors: string[] = [];

  // 1. Permission keys are unique.
  const permissionKeys = new Set<string>();
  for (const p of PERMISSIONS) {
    if (permissionKeys.has(p.key)) {
      errors.push(`Duplicate permission key: ${p.key}`);
    }
    permissionKeys.add(p.key);
  }

  // 2. Permission keys follow the {category}:{action} pattern.
  for (const p of PERMISSIONS) {
    if (!/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/.test(p.key)) {
      errors.push(`Permission key "${p.key}" doesn't match {category}:{action} pattern.`);
    }
  }

  // 3. Every system role references only permissions that exist in the catalog.
  for (const role of SYSTEM_ROLES) {
    for (const permKey of role.permissions) {
      if (!permissionKeys.has(permKey)) {
        errors.push(`Role "${role.slug}" references unknown permission "${permKey}".`);
      }
    }
  }

  // 4. System role slugs are unique.
  const roleSlugs = new Set<string>();
  for (const role of SYSTEM_ROLES) {
    if (roleSlugs.has(role.slug)) {
      errors.push(`Duplicate system role slug: ${role.slug}`);
    }
    roleSlugs.add(role.slug);
  }

  // 5. Owner role must include EVERY permission (including locked ones).
  // This is a hard invariant — Owner is the only role that holds the locked
  // permissions, and that's how the schema enforces "exactly one Owner per
  // workspace can do destructive things".
  const ownerRole = SYSTEM_ROLES.find(r => r.slug === "owner");
  if (!ownerRole) {
    errors.push("Owner system role is missing.");
  } else {
    const ownerPerms = new Set(ownerRole.permissions);
    for (const p of PERMISSIONS) {
      if (!ownerPerms.has(p.key)) {
        errors.push(`Owner role is missing permission "${p.key}". Owner must hold every permission.`);
      }
    }
  }

  // 6. Locked permissions appear ONLY in system roles. (System role definitions
  //    can include them; the runtime check that no custom role can use them
  //    happens in the role editor middleware, not here.)
  // This validation is informational only — we just print which roles hold
  // which locked permissions so a human can review.
  log.info(`Locked permission usage in system roles:`);
  for (const lockedKey of LOCKED_PERMISSION_KEYS) {
    const holders = SYSTEM_ROLES
      .filter(r => r.permissions.includes(lockedKey))
      .map(r => r.slug);
    log.info(`  • ${lockedKey} → ${holders.join(", ") || "(no holders)"}`);
  }

  if (errors.length > 0) {
    for (const err of errors) log.err(err);
    log.err(`Validation failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  log.ok(`Validation passed. ${PERMISSIONS.length} permissions, ${SYSTEM_ROLES.length} system roles.`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    return;
  }

  log.divider();
  console.log(`Watchtower seed runner — version ${SEED_VERSION}`);
  log.divider();

  assertSafeToRun(flags);
  validate();

  // Filter seeders if --only was specified.
  const seedersToRun = flags.only
    ? SEEDERS.filter(s => s.name === flags.only)
    : SEEDERS;

  if (seedersToRun.length === 0) {
    log.err(`No seeder matches --only=${flags.only}`);
    log.info(`Available: ${SEEDERS.map(s => s.name).join(", ")}`);
    process.exit(1);
  }

  // Use a fresh PrismaClient. The runner intentionally does NOT use the
  // RLS-wrapped ctx.db proxy — seed operations need full access to insert
  // system roles and permissions, which are workspace-independent.
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_MIGRATE_URL!,
  }),
});
  try {
    for (const seeder of seedersToRun) {
      log.step(`${seeder.name} — ${seeder.description}`);
      const count = flags.dryRun
      ? await seeder.dryRun(db as any) 
      : await seeder.run(db as any);
      log.ok(`${seeder.name}: ${count} records ${flags.dryRun ? "would be" : ""} affected.`);
    }

    // === DIAGNOSTIC: prove the data was actually written to the DB ===
    if (!flags.dryRun) {
      log.info("🔍 Verifying final DB state after seed...");
      const [permCount, roleCount, rpCount] = await Promise.all([
        db.permission.count(),
        db.role.count(),
        db.rolePermission.count(),
      ]);
      log.info(`   Permission: ${permCount} rows`);
      log.info(`   Role:       ${roleCount} rows`);
      log.info(`   RolePermission: ${rpCount} rows`);
    }

    log.divider();
    log.ok(flags.dryRun ? "Dry run complete. No changes written." : "Seed complete.");
    log.divider();
  } catch (err) {
    log.err("Seed run failed:");
    console.error(err);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
