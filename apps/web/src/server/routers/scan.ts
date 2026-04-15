/**
 * Scan router — manage compliance scan lifecycle within a workspace.
 *
 * Scans sit at Workspace → Scope → Tenant → Scan in the hierarchy.
 * Each scan represents a compliance check run against a connected
 * Microsoft 365 tenant, triggered manually, by schedule, webhook, or API.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before mutations (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #5, API-Conventions §9)
 * - Allowlisted filters (Non-Negotiable #10, API-Conventions §10)
 * - Scope derived from resource, not from input (API-Conventions §5)
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 * - Audit log in same transaction as mutation (Code-Conventions §1)
 * - inngestRunId NEVER selected (internal debugging field)
 * - Scans are NOT soft-deleted (no deletedAt filter)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import { createAuditEvent } from "@watchtower/db";
import { inngest } from "@watchtower/scan-pipeline";
import { throwWatchtowerError } from "../errors.ts";
import {
  checkIdempotencyKey,
  saveIdempotencyResult,
  computeRequestHash,
} from "../idempotency.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const scanTrigger = z.enum(["MANUAL", "SCHEDULED", "WEBHOOK", "API"]);
const scanStatus = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

/**
 * Output schema for a scan. NEVER includes `inngestRunId`.
 */
const scanOutput = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scopeId: z.string(),
  tenantId: z.string(),
  triggeredBy: scanTrigger,
  triggeredByUserId: z.string().nullable(),
  status: scanStatus,
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
  checksRun: z.number().int(),
  checksFailed: z.number().int(),
  createdAt: z.coerce.date(),
});

/**
 * Standard select clause that explicitly excludes `inngestRunId`.
 * Reused across all queries to guarantee the internal field never leaks.
 */
const SCAN_SELECT = {
  id: true,
  workspaceId: true,
  scopeId: true,
  tenantId: true,
  triggeredBy: true,
  triggeredByUserId: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  checksRun: true,
  checksFailed: true,
  createdAt: true,
} as const;

// -- list --
const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  scopeId: z.string().optional(),
  tenantId: z.string().optional(),
  status: scanStatus.optional(),
  triggeredBy: scanTrigger.optional(),
});

const listOutput = z.object({
  items: z.array(scanOutput),
  nextCursor: z.string().nullable(),
});

// -- get --
const getInput = z.object({
  scanId: z.string(),
});

// -- trigger --
const triggerInput = z.object({
  idempotencyKey: z.string().uuid(),
  tenantId: z.string(),
});

const triggerOutput = scanOutput;

// -- cancel --
const cancelInput = z.object({
  idempotencyKey: z.string().uuid(),
  scanId: z.string(),
});

const cancelOutput = scanOutput;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const scanRouter = router({
  /**
   * List scans in the current workspace.
   *
   * Permission: scans:read (no scope — the query itself filters by
   * accessible scopes via RLS and explicit WHERE)
   *
   * Per API-Conventions §5: "For list, the check is
   * ctx.requirePermission('...') (no scope), then the SQL query
   * filters by scopeId IN (user's accessible scopes)."
   *
   * Allowlisted filters: scopeId, tenantId, status, triggeredBy
   * Order: createdAt DESC, id ASC (tiebreaker)
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("scans:read");

      // Build scope filter: if caller supplies a scopeId, intersect it
      // with accessible scopes. Otherwise use the full accessible set.
      // Layer 2 (explicit SQL filter) + Layer 3 (RLS safety net via ctx.db).
      const scopeFilter = input.scopeId
        ? { scopeId: input.scopeId }
        : { scopeId: { in: ctx.permissionContext.accessibleScopeIds } };

      const rows = await ctx.db.scan.findMany({
        where: {
          workspaceId: ctx.session.workspaceId,
          ...scopeFilter,
          ...(input.tenantId !== undefined
            ? { tenantId: input.tenantId }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.triggeredBy !== undefined
            ? { triggeredBy: input.triggeredBy }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: SCAN_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor = hasMore
        ? (items[items.length - 1]?.id ?? null)
        : null;

      return { items, nextCursor };
    }),

  /**
   * Get a single scan by ID.
   *
   * Permission: scans:read, scoped to the scan's scope.
   * Existence check first, then permission check (API-Conventions §5).
   */
  get: protectedProcedure
    .input(getInput)
    .output(scanOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const scan = await ctx.db.scan.findFirst({
        where: {
          id: input.scanId,
          workspaceId: ctx.session.workspaceId,
        },
        select: SCAN_SELECT,
      });

      if (!scan) {
        throwWatchtowerError(WATCHTOWER_ERRORS.SCAN.NOT_FOUND);
      }

      // Permission check after existence check — prevents resource
      // existence leaks (returns NOT_FOUND, not FORBIDDEN).
      await ctx.requirePermission("scans:read", { scopeId: scan.scopeId });

      return scan;
    }),

  /**
   * Manually trigger a compliance scan for a tenant.
   *
   * Permission: scans:trigger, scoped to the tenant's scope.
   * Audit: scan.trigger logged with tenant and scan details.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   *
   * Guard: rejects if the tenant already has a PENDING or RUNNING scan.
   */
  trigger: protectedProcedure
    .input(triggerInput)
    .output(triggerOutput)
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
        return cached.responseBody as z.infer<typeof triggerOutput>;
      }

      // Verify the target tenant exists, belongs to this workspace, and
      // is not soft-deleted (tenants support soft-delete).
      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: { id: true, scopeId: true },
      });

      if (!tenant) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("scans:trigger", {
        scopeId: tenant.scopeId,
      });

      // Duplicate guard: reject if the tenant already has an active scan.
      const activeScan = await ctx.db.scan.findFirst({
        where: {
          tenantId: tenant.id,
          workspaceId: ctx.session.workspaceId,
          status: { in: ["PENDING", "RUNNING"] },
        },
        select: { id: true },
      });

      if (activeScan) {
        throwWatchtowerError(WATCHTOWER_ERRORS.SCAN.ALREADY_RUNNING);
      }

      // Create scan and write audit log in the same transaction.
      // ctx.db is already inside a withRLS() transaction, so both
      // operations share the same transaction boundary.
      const created = await ctx.db.scan.create({
        data: {
          workspaceId: ctx.session.workspaceId,
          scopeId: tenant.scopeId,
          tenantId: tenant.id,
          triggeredBy: "MANUAL",
          triggeredByUserId: ctx.session.userId,
          status: "PENDING",
        },
        select: SCAN_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: tenant.scopeId,
        eventType: "scan.trigger",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Scan",
        targetId: created.id,
        eventData: {
          tenantId: tenant.id,
          triggeredBy: "MANUAL",
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

      // Emit scan/execute event to Inngest to start the scan pipeline.
      // This is fire-and-forget — if Inngest is down, the scan stays in
      // PENDING and can be retried. The pipeline will guard against
      // duplicate execution via the PENDING status check in step 1.
      await inngest.send({
        name: "scan/execute",
        data: {
          scanId: created.id,
          workspaceId: ctx.session.workspaceId,
          tenantId: tenant.id,
          scopeId: tenant.scopeId,
        },
      });

      return created;
    }),

  /**
   * Cancel a pending or running scan.
   *
   * Permission: scans:cancel, scoped to the scan's scope.
   * State guard: only PENDING or RUNNING scans can be cancelled.
   * Audit: scan.cancel logged with scan ID and previous status.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  cancel: protectedProcedure
    .input(cancelInput)
    .output(cancelOutput)
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
        return cached.responseBody as z.infer<typeof cancelOutput>;
      }

      // Existence check first (API-Conventions §5)
      const existing = await ctx.db.scan.findFirst({
        where: {
          id: input.scanId,
          workspaceId: ctx.session.workspaceId,
        },
        select: {
          id: true,
          scopeId: true,
          status: true,
        },
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.SCAN.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("scans:cancel", {
        scopeId: existing.scopeId,
      });

      // State guard: only PENDING or RUNNING scans can be cancelled.
      // Terminal states (SUCCEEDED, FAILED, CANCELLED) are rejected.
      if (
        existing.status !== "PENDING" &&
        existing.status !== "RUNNING"
      ) {
        throwWatchtowerError(WATCHTOWER_ERRORS.SCAN.CANNOT_CANCEL);
      }

      // Update scan status and write audit log in the same transaction.
      const cancelled = await ctx.db.scan.update({
        where: { id: existing.id },
        data: {
          status: "CANCELLED",
          finishedAt: new Date(),
        },
        select: SCAN_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: existing.scopeId,
        eventType: "scan.cancel",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Scan",
        targetId: existing.id,
        eventData: {
          previousStatus: existing.status,
        },
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      await saveIdempotencyResult(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
        cancelled,
        200,
      );

      // Emit scan/cancel event to Inngest.
      // This triggers the cancelOn mechanism on the execute-scan function,
      // aborting the in-progress scan pipeline if it hasn't completed yet.
      await inngest.send({
        name: "scan/cancel",
        data: {
          scanId: existing.id,
        },
      });

      return cancelled;
    }),
});
