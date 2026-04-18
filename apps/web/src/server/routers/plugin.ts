/**
 * Plugin router — manage GitHub-synced custom check repositories.
 *
 * PluginRepos let workspaces connect external GitHub repositories
 * containing custom compliance checks. Checks are loaded dynamically
 * at scan time from the connected repo.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before any data access (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #6, API-Conventions §9)
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 * - Audit log in same transaction as mutation (Code-Conventions §1)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import { createAuditEvent } from "@watchtower/db";
import { throwWatchtowerError } from "../errors.ts";
import {
  checkIdempotencyKey,
  saveIdempotencyResult,
  computeRequestHash,
} from "../idempotency.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const pluginRepoOutput = z.object({
  id: z.string(),
  workspaceId: z.string(),
  githubRepo: z.string(),
  branch: z.string(),
  lastSyncAt: z.coerce.date().nullable(),
  lastSyncSha: z.string().nullable(),
  approved: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const listOutput = z.object({
  items: z.array(pluginRepoOutput),
  nextCursor: z.string().nullable(),
});

const getInput = z.object({
  pluginRepoId: z.string(),
});

// -- connect --
const connectInput = z.object({
  idempotencyKey: z.string().uuid(),
  githubRepo: z
    .string()
    .min(3)
    .max(200)
    .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, {
      message:
        'GitHub repo must be in "owner/repo" format (e.g. "acme/checks").',
    }),
  branch: z.string().min(1).max(100).default("main"),
});

const connectOutput = pluginRepoOutput;

// -- disconnect --
const disconnectInput = z.object({
  idempotencyKey: z.string().uuid(),
  pluginRepoId: z.string(),
});

const disconnectOutput = z.object({
  id: z.string(),
});

/**
 * Reusable Prisma select clause for pluginRepo queries.
 */
const PLUGIN_REPO_SELECT = {
  id: true,
  workspaceId: true,
  githubRepo: true,
  branch: true,
  lastSyncAt: true,
  lastSyncSha: true,
  approved: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const pluginRouter = router({
  /**
   * List plugin repos in the current workspace.
   *
   * Permission: plugins:read (workspace-level, no scope)
   * Cursor-based pagination ordered by createdAt desc, id asc.
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("plugins:read");

      const rows = await ctx.db.pluginRepo.findMany({
        where: {
          workspaceId: ctx.session.workspaceId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: PLUGIN_REPO_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

      return { items, nextCursor };
    }),

  /**
   * Get a single plugin repo by ID.
   *
   * Permission: plugins:read (workspace-level, no scope)
   * Existence check first → NOT_FOUND, then permission check.
   */
  get: protectedProcedure
    .input(getInput)
    .output(pluginRepoOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const pluginRepo = await ctx.db.pluginRepo.findFirst({
        where: {
          id: input.pluginRepoId,
          workspaceId: ctx.session.workspaceId,
        },
        select: PLUGIN_REPO_SELECT,
      });

      if (!pluginRepo) {
        throwWatchtowerError(WATCHTOWER_ERRORS.PLUGIN.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("plugins:read");

      return pluginRepo;
    }),

  /**
   * Connect a GitHub repository as a plugin source.
   *
   * Permission: plugins:connect_repo (workspace-level, no scope)
   * Audit: plugin.connect logged with repo details.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   *
   * Guard: rejects if the same githubRepo is already connected in this workspace.
   */
  connect: protectedProcedure
    .input(connectInput)
    .output(connectOutput)
    .mutation(async ({ input, ctx }) => {
      // Idempotency check (API-Conventions §8)
      const requestHash = computeRequestHash(input as Record<string, unknown>);
      const cached = await checkIdempotencyKey(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
      );
      if (cached) {
        return cached.responseBody as z.infer<typeof connectOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("plugins:connect_repo");

      // Guard: duplicate githubRepo within the workspace
      const duplicate = await ctx.db.pluginRepo.findFirst({
        where: {
          workspaceId: ctx.session.workspaceId,
          githubRepo: input.githubRepo,
        },
        select: { id: true },
      });

      if (duplicate) {
        throwWatchtowerError(WATCHTOWER_ERRORS.PLUGIN.ALREADY_CONNECTED);
      }

      // Create the plugin repo and write audit log in the same transaction.
      // ctx.db is the transaction client from withRLS() which wraps
      // the entire procedure in a $transaction(), ensuring atomicity.
      const created = await ctx.db.pluginRepo.create({
        data: {
          workspaceId: ctx.session.workspaceId,
          githubRepo: input.githubRepo,
          branch: input.branch,
        },
        select: PLUGIN_REPO_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "plugin.connect",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "PluginRepo",
        targetId: created.id,
        eventData: {
          githubRepo: input.githubRepo,
          branch: input.branch,
        },
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      await saveIdempotencyResult(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
        created,
        200,
      );

      return created;
    }),

  /**
   * Disconnect a plugin repo (hard delete).
   *
   * Permission: plugins:disconnect_repo (workspace-level, no scope)
   * Audit: plugin.disconnect logged.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   *
   * Guard: plugin repo must exist (NOT_FOUND).
   */
  disconnect: protectedProcedure
    .input(disconnectInput)
    .output(disconnectOutput)
    .mutation(async ({ input, ctx }) => {
      // Idempotency check (API-Conventions §8)
      const requestHash = computeRequestHash(input as Record<string, unknown>);
      const cached = await checkIdempotencyKey(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
      );
      if (cached) {
        return cached.responseBody as z.infer<typeof disconnectOutput>;
      }

      // Existence check first (API-Conventions §5)
      const existing = await ctx.db.pluginRepo.findFirst({
        where: {
          id: input.pluginRepoId,
          workspaceId: ctx.session.workspaceId,
        },
        select: { id: true, githubRepo: true, branch: true },
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.PLUGIN.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("plugins:disconnect_repo");

      // Hard delete — PluginRepo has no soft-delete column
      await ctx.db.pluginRepo.delete({
        where: { id: existing.id },
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "plugin.disconnect",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "PluginRepo",
        targetId: existing.id,
        eventData: {
          githubRepo: existing.githubRepo,
          branch: existing.branch,
        },
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      const result = { id: existing.id };

      await saveIdempotencyResult(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
        result,
        200,
      );

      return result;
    }),
});
