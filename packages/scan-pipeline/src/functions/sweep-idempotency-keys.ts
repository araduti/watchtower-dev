/**
 * Idempotency key sweeper — periodic cleanup of expired idempotency records.
 *
 * Per API-Conventions §8: "A periodic sweeper job removes idempotency rows
 * older than 24 hours."
 *
 * This Inngest cron function runs every hour and deletes IdempotencyKey
 * rows whose `createdAt` is older than 24 hours. The sweeper runs under
 * the migrate role (via DATABASE_MIGRATE_URL) because:
 *   1. It operates across ALL workspaces (no per-workspace RLS context)
 *   2. It is a housekeeping operation, not a user-facing request
 *
 * In development, when Inngest is not available, this is a no-op.
 * The cron schedule is configurable via the IDEMPOTENCY_SWEEP_CRON env var.
 */

import { inngest } from "../inngest-client.ts";

/**
 * The maximum age of an idempotency key before it is swept.
 * 24 hours, per API-Conventions §8.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const sweepIdempotencyKeys = inngest.createFunction(
  {
    id: "sweep-idempotency-keys",
    name: "Sweep expired idempotency keys",
    triggers: [{ cron: process.env.IDEMPOTENCY_SWEEP_CRON ?? "0 * * * *" }],
  },
  async ({ step }) => {
    const deletedCount = await step.run("delete-expired-keys", async () => {
      // Lazy-import to avoid circular dependency at module load time.
      // The sweep uses a dedicated PrismaClient connecting via the
      // migrate role (DATABASE_MIGRATE_URL) to bypass RLS, since this
      // is a cross-workspace housekeeping operation.
      const { PrismaClient } = await import("@prisma/client");
      const { PrismaPg } = await import("@prisma/adapter-pg");

      const migrateUrl =
        process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;

      if (!migrateUrl) {
        console.warn(
          "[sweep-idempotency-keys] No DATABASE_MIGRATE_URL or DATABASE_URL — skipping sweep.",
        );
        return 0;
      }

      const adapter = new PrismaPg({ connectionString: migrateUrl });
      const client = new PrismaClient({ adapter });

      try {
        const cutoff = new Date(Date.now() - MAX_AGE_MS);
        const result = await client.idempotencyKey.deleteMany({
          where: {
            createdAt: { lt: cutoff },
          },
        });
        return result.count;
      } finally {
        await client.$disconnect();
      }
    });

    return {
      swept: deletedCount,
      message: `Swept ${deletedCount} expired idempotency key(s).`,
    };
  },
);
