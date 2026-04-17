// =============================================================================
// Watchtower — Dev data seeder
// =============================================================================
//
// Creates a ready-to-use local development environment with:
//   - A dev user (admin@watchtower.dev / watchtower-dev)
//   - A Better Auth organization linked to a Watchtower Workspace
//   - A Scope ("Default Scope")
//   - A demo Tenant (fake M365 connection)
//   - A Membership with the Owner system role
//
// This seeder is ONLY for local development. It is skipped automatically
// in production (NODE_ENV=production) unless --force is passed.
//
// The seeder is idempotent — safe to run repeatedly. It uses upsert
// semantics for all records.
//
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@better-auth/utils/password";
import {
  createCipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

// =============================================================================
// DEV DATA CONSTANTS
// =============================================================================

/** Dev user credentials — printed to the console after seeding. */
export const DEV_USER = {
  email: "admin@watchtower.dev",
  password: "watchtower-dev",
  name: "Dev Admin",
} as const;

/** Stable IDs so repeated runs don't create duplicates. */
const IDS = {
  user: "dev-user-000000000000001",
  account: "dev-account-000000000000001",
  organization: "dev-org-000000000000001",
  orgMember: "dev-orgmember-0000000000001",
  workspace: "dev-workspace-00000000000001",
  scope: "dev-scope-000000000000001",
  tenant: "dev-tenant-000000000000001",
  membership: "dev-membership-0000000000001",
} as const;

// =============================================================================
// CREDENTIAL ENCRYPTION (matches graph-adapter.ts decryptCredentials layout)
// =============================================================================

/** AES-256-GCM encryption constants — must match @watchtower/adapters. */
const AES_ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const AES_IV_LENGTH = 12;

/**
 * Encrypt credentials into the AES-256-GCM buffer layout expected by
 * the adapter's `decryptCredentials`:
 *
 *   [12-byte IV][16-byte authTag][ciphertext...]
 *
 * Uses `WATCHTOWER_CREDENTIAL_KEY` from the environment.
 */
function encryptCredentials(credentials: {
  clientId: string;
  clientSecret: string;
  msTenantId: string;
}): Uint8Array<ArrayBuffer> {
  const encryptionKey = process.env["WATCHTOWER_CREDENTIAL_KEY"];
  if (!encryptionKey) {
    throw new Error(
      "WATCHTOWER_CREDENTIAL_KEY environment variable is not set.\n" +
        "Add it to your .env file (see .env.example):\n" +
        "  WATCHTOWER_CREDENTIAL_KEY=<64 hex chars>\n" +
        "Generate one with: openssl rand -hex 32",
    );
  }

  const keyBuffer = Buffer.from(encryptionKey, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error(
      `WATCHTOWER_CREDENTIAL_KEY must be exactly 64 hex characters (32 bytes), ` +
        `got ${encryptionKey.length} hex characters (${keyBuffer.length} bytes).`,
    );
  }

  const iv = randomBytes(AES_IV_LENGTH);
  const plaintext = JSON.stringify(credentials);

  const cipher = createCipheriv(AES_ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Buffer layout: [IV][authTag][ciphertext]
  const blob = Buffer.concat([iv, authTag, encrypted]);
  // Prisma 7 Bytes = Uint8Array<ArrayBuffer>; Buffer inherits ArrayBufferLike.
  // .slice() returns a Uint8Array backed by a fresh ArrayBuffer.
  return new Uint8Array(blob).slice();
}

// =============================================================================
// SEEDER IMPLEMENTATION
// =============================================================================

/**
 * Seed dev data. Returns the number of records affected.
 *
 * Uses raw SQL for Better Auth tables (user, account, organization, member)
 * because those models are not part of the Prisma schema — they are managed
 * by Better Auth's own migration system.
 */
export async function seedDevData(db: PrismaClient): Promise<number> {
  const now = new Date();
  let count = 0;

  // -------------------------------------------------------------------------
  // 1. Better Auth: user
  // -------------------------------------------------------------------------
  const passwordHash = await hashPassword(DEV_USER.password);

  await (db as any).$executeRaw`
    INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    VALUES (${IDS.user}, ${DEV_USER.name}, ${DEV_USER.email}, true, ${now}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "email" = EXCLUDED."email",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
  count++;

  // -------------------------------------------------------------------------
  // 2. Better Auth: account (credential provider with hashed password)
  // -------------------------------------------------------------------------
  await (db as any).$executeRaw`
    INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
    VALUES (${IDS.account}, ${IDS.user}, 'credential', ${IDS.user}, ${passwordHash}, ${now}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "password" = EXCLUDED."password",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
  count++;

  // -------------------------------------------------------------------------
  // 3. Better Auth: organization
  // -------------------------------------------------------------------------
  await (db as any).$executeRaw`
    INSERT INTO "organization" ("id", "name", "slug", "createdAt")
    VALUES (${IDS.organization}, 'Dev Workspace', 'dev-workspace', ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "slug" = EXCLUDED."slug"
  `;
  count++;

  // -------------------------------------------------------------------------
  // 4. Better Auth: member (links user to organization)
  // -------------------------------------------------------------------------
  await (db as any).$executeRaw`
    INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt")
    VALUES (${IDS.orgMember}, ${IDS.organization}, ${IDS.user}, 'owner', ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "role" = EXCLUDED."role"
  `;
  count++;

  // -------------------------------------------------------------------------
  // 5. Watchtower: Workspace (linked to Better Auth org)
  // -------------------------------------------------------------------------
  await db.workspace.upsert({
    where: { id: IDS.workspace },
    create: {
      id: IDS.workspace,
      name: "Dev Workspace",
      betterAuthOrgId: IDS.organization,
      scopeIsolationMode: "SOFT",
    },
    update: {
      name: "Dev Workspace",
      betterAuthOrgId: IDS.organization,
      deletedAt: null, // un-soft-delete if previously deleted
    },
  });
  count++;

  // -------------------------------------------------------------------------
  // 6. Watchtower: Scope
  // -------------------------------------------------------------------------
  await db.scope.upsert({
    where: { id: IDS.scope },
    create: {
      id: IDS.scope,
      workspaceId: IDS.workspace,
      name: "Default Scope",
      slug: "default",
      metadata: {},
    },
    update: {
      name: "Default Scope",
      deletedAt: null,
    },
  });
  count++;

  // -------------------------------------------------------------------------
  // 7. Watchtower: Tenant (demo M365 connection)
  // -------------------------------------------------------------------------
  await db.tenant.upsert({
    where: { id: IDS.tenant },
    create: {
      id: IDS.tenant,
      workspaceId: IDS.workspace,
      scopeId: IDS.scope,
      displayName: "Contoso (Demo)",
      msTenantId: "00000000-0000-0000-0000-000000000001",
      encryptedCredentials: encryptCredentials({
        clientId: "00000000-0000-0000-0000-000000000000",
        clientSecret: "dev-client-secret-not-real",
        msTenantId: "00000000-0000-0000-0000-000000000001",
      }),
      authMethod: "CLIENT_SECRET",
      status: "ACTIVE",
    },
    update: {
      displayName: "Contoso (Demo)",
      deletedAt: null,
    },
  });
  count++;

  // -------------------------------------------------------------------------
  // 8. Watchtower: Membership + Owner role
  // -------------------------------------------------------------------------
  // Find the Owner system role (seeded by the permissions seeder).
  const ownerRole = await db.role.findFirst({
    where: { slug: "owner", isSystem: true, workspaceId: null },
  });

  if (!ownerRole) {
    throw new Error(
      "Owner system role not found. Run the permissions seeder first:\n" +
        "  bun run db:seed -- --only=permissions\n" +
        "  bun run db:seed -- --only=roles",
    );
  }

  // Upsert workspace-wide membership (scopeId is NULL for workspace-wide).
  // Prisma upsert doesn't support nullable fields in composite unique
  // constraints, so we use the stable ID as the where clause instead.
  await db.membership.upsert({
    where: { id: IDS.membership },
    create: {
      id: IDS.membership,
      userId: IDS.user,
      workspaceId: IDS.workspace,
      scopeId: null,
    },
    update: {},
  });
  count++;

  // Assign Owner role to membership (idempotent via composite PK)
  await db.membershipRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId: IDS.membership,
        roleId: ownerRole.id,
      },
    },
    create: {
      membershipId: IDS.membership,
      roleId: ownerRole.id,
    },
    update: {},
  });
  count++;

  return count;
}

/**
 * Dry-run: report what would be created without writing.
 */
export async function dryRunDevData(): Promise<number> {
  console.log("  Would create:");
  console.log(`    • Better Auth user: ${DEV_USER.email}`);
  console.log(`    • Better Auth account (credential provider)`);
  console.log(`    • Better Auth organization: Dev Workspace`);
  console.log(`    • Better Auth member (owner)`);
  console.log(`    • Workspace: Dev Workspace`);
  console.log(`    • Scope: Default Scope`);
  console.log(`    • Tenant: Contoso (Demo)`);
  console.log(`    • Membership with Owner role`);
  return 9;
}
