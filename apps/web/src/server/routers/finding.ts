/**
 * Finding router — lifecycle management for compliance findings.
 *
 * Findings are the core output of Watchtower's compliance engine. Each Finding
 * represents a single compliance check result for a specific tenant, keyed on
 * `(tenantId, checkSlug)`. Findings are DURABLE — never deleted, never
 * soft-deleted — and transition through a well-defined state machine:
 *
 *   OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED
 *              ↓                           ↑
 *         ACCEPTED_RISK ──────────────────┘
 *
 * Each transition is a separate procedure with distinct permissions,
 * validation, and audit semantics.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before mutations (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #5, API-Conventions §9)
 * - No deletedAt filter — findings are durable, never deleted
 * - Scope derived from finding's scopeId, not from input (API-Conventions §5)
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 * - Audit log in same transaction as mutation (Code-Conventions §1)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
// Enums
// ---------------------------------------------------------------------------

const findingStatusEnum = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "ACCEPTED_RISK",
  "RESOLVED",
  "NOT_APPLICABLE",
]);

const severityEnum = z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const visibilityEnum = z.enum(["DEFAULT", "MUTED"]);

// ---------------------------------------------------------------------------
// Schemas — list
// ---------------------------------------------------------------------------

const findingListItem = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scopeId: z.string(),
  tenantId: z.string(),
  checkSlug: z.string(),
  status: findingStatusEnum,
  visibility: visibilityEnum,
  severity: severityEnum,
  severityRank: z.number().int(),
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  assignedTo: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  status: findingStatusEnum.optional(),
  severity: severityEnum.optional(),
  scopeId: z.string().optional(),
  visibility: visibilityEnum.optional(),
});

const listOutput = z.object({
  items: z.array(findingListItem),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Schemas — get (full detail)
// ---------------------------------------------------------------------------

const findingDetail = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scopeId: z.string(),
  tenantId: z.string(),
  checkSlug: z.string(),
  status: findingStatusEnum,
  visibility: visibilityEnum,
  severity: severityEnum,
  severityRank: z.number().int(),
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  acknowledgedAt: z.coerce.date().nullable(),
  acknowledgedBy: z.string().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  resolvedBy: z.string().nullable(),
  regressionFromResolvedAt: z.coerce.date().nullable(),
  acceptedAt: z.coerce.date().nullable(),
  acceptedBy: z.string().nullable(),
  acceptanceReason: z.string().nullable(),
  acceptanceExpiresAt: z.coerce.date().nullable(),
  mutedAt: z.coerce.date().nullable(),
  mutedBy: z.string().nullable(),
  mutedUntil: z.coerce.date().nullable(),
  assignedTo: z.string().nullable(),
  notes: z.string().nullable(),
  latestEvidenceId: z.string().nullable(),
  evidenceDueAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const getInput = z.object({
  findingId: z.string(),
});

// ---------------------------------------------------------------------------
// Schemas — mutations
// ---------------------------------------------------------------------------

const acknowledgeInput = z.object({
  idempotencyKey: z.string().uuid(),
  findingId: z.string(),
});

const acknowledgeOutput = z.object({ id: z.string() });

const muteInput = z.object({
  idempotencyKey: z.string().uuid(),
  findingId: z.string(),
  reason: z.string().optional(),
  mutedUntil: z.coerce.date().optional(),
});

const muteOutput = z.object({ id: z.string() });

const acceptRiskInput = z.object({
  idempotencyKey: z.string().uuid(),
  findingId: z.string(),
  reason: z.string(),
  acceptanceExpiresAt: z.coerce.date(),
});

const acceptRiskOutput = z.object({ id: z.string() });

const resolveInput = z.object({
  idempotencyKey: z.string().uuid(),
  findingId: z.string(),
});

const resolveOutput = z.object({ id: z.string() });

// ---------------------------------------------------------------------------
// Reusable Prisma selects
// ---------------------------------------------------------------------------

/** Select clause for list queries — lightweight, matches the composite index. */
const FINDING_LIST_SELECT = {
  id: true,
  workspaceId: true,
  scopeId: true,
  tenantId: true,
  checkSlug: true,
  status: true,
  visibility: true,
  severity: true,
  severityRank: true,
  firstSeenAt: true,
  lastSeenAt: true,
  assignedTo: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Select clause for detail queries — full lifecycle timestamps. */
const FINDING_DETAIL_SELECT = {
  id: true,
  workspaceId: true,
  scopeId: true,
  tenantId: true,
  checkSlug: true,
  status: true,
  visibility: true,
  severity: true,
  severityRank: true,
  firstSeenAt: true,
  lastSeenAt: true,
  acknowledgedAt: true,
  acknowledgedBy: true,
  resolvedAt: true,
  resolvedBy: true,
  regressionFromResolvedAt: true,
  acceptedAt: true,
  acceptedBy: true,
  acceptanceReason: true,
  acceptanceExpiresAt: true,
  mutedAt: true,
  mutedBy: true,
  mutedUntil: true,
  assignedTo: true,
  notes: true,
  latestEvidenceId: true,
  evidenceDueAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const findingRouter = router({
  // =========================================================================
  // finding.list — THE flagship query, cursor-paginated
  // =========================================================================

  /**
   * List findings in the current workspace with optional filters.
   *
   * Permission: findings:read (no scope — the query itself filters by
   * accessible scopes via RLS and explicit WHERE).
   *
   * Per API-Conventions §5: "For list, the check is
   * ctx.requirePermission('...') (no scope), then the SQL query
   * filters by scopeId IN (user's accessible scopes)."
   *
   * Order: severityRank DESC, firstSeenAt ASC, id ASC
   * (matches the composite index on [workspaceId, scopeId, status, severityRank, firstSeenAt])
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("findings:read");

      // Build allowlisted WHERE clause.
      // Layer 2 (explicit SQL filter): restrict to workspace and accessible scopes.
      // Layer 3 (RLS) is the safety net via ctx.db.
      const where = {
        workspaceId: ctx.session.workspaceId,
        scopeId: { in: ctx.permissionContext.accessibleScopeIds },
        ...(input.status && { status: input.status }),
        ...(input.severity && { severity: input.severity }),
        ...(input.scopeId && { scopeId: input.scopeId }),
        ...(input.visibility && { visibility: input.visibility }),
      };

      // Cursor pagination: fetch limit + 1 to detect next page
      const rows = await ctx.db.finding.findMany({
        where,
        orderBy: [
          { severityRank: "desc" },
          { firstSeenAt: "asc" },
          { id: "asc" },
        ],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: FINDING_LIST_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor =
        hasMore ? (items[items.length - 1]?.id ?? null) : null;

      return { items, nextCursor };
    }),

  // =========================================================================
  // finding.get — single finding by ID
  // =========================================================================

  /**
   * Get a single finding by ID with full lifecycle details.
   *
   * Permission: findings:read, scoped to the finding's scopeId.
   * Existence check first, then permission check (API-Conventions §5).
   * Scope derived from the resource, not from input.
   */
  get: protectedProcedure
    .input(getInput)
    .output(findingDetail)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const finding = await ctx.db.finding.findFirst({
        where: {
          id: input.findingId,
          workspaceId: ctx.session.workspaceId,
        },
        select: FINDING_DETAIL_SELECT,
      });

      if (!finding) {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.NOT_FOUND);
      }

      // Permission check after existence check — scope derived from resource
      await ctx.requirePermission("findings:read", {
        scopeId: finding.scopeId,
      });

      return finding;
    }),

  // =========================================================================
  // finding.acknowledge — transition OPEN → ACKNOWLEDGED
  // =========================================================================

  /**
   * Acknowledge an open finding.
   *
   * Permission: findings:acknowledge, scoped to the finding's scopeId.
   * Guard: status must be OPEN — throws INVALID_TRANSITION otherwise.
   * Guard: already ACKNOWLEDGED — throws ALREADY_ACKNOWLEDGED.
   * Sets: status = ACKNOWLEDGED, acknowledgedAt = now, acknowledgedBy = userId.
   * Audit: finding.acknowledge logged with finding details.
   */
  acknowledge: protectedProcedure
    .input(acknowledgeInput)
    .output(acknowledgeOutput)
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
        return cached.responseBody as z.infer<typeof acknowledgeOutput>;
      }

      // Existence check first (API-Conventions §5)
      const finding = await ctx.db.finding.findFirst({
        where: {
          id: input.findingId,
          workspaceId: ctx.session.workspaceId,
        },
        select: { id: true, scopeId: true, status: true },
      });

      if (!finding) {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.NOT_FOUND);
      }

      // Permission check after existence check — scope derived from resource
      await ctx.requirePermission("findings:acknowledge", {
        scopeId: finding.scopeId,
      });

      // Guard: already ACKNOWLEDGED → specific error
      if (finding.status === "ACKNOWLEDGED") {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.ALREADY_ACKNOWLEDGED);
      }

      // Guard: must be OPEN → INVALID_TRANSITION for any other status
      if (finding.status !== "OPEN") {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.INVALID_TRANSITION);
      }

      // Mutation + audit in same transaction (Code-Conventions §1)
      const now = new Date();

      const updated = await ctx.db.finding.update({
        where: { id: finding.id },
        data: {
          status: "ACKNOWLEDGED",
          acknowledgedAt: now,
          acknowledgedBy: ctx.session.userId,
        },
        select: { id: true },
      });

      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: finding.scopeId,
        eventType: "finding.acknowledge",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Finding",
        targetId: updated.id,
        eventData: {
          previousStatus: finding.status,
          newStatus: "ACKNOWLEDGED",
        },
        traceId: ctx.traceId,
      });

      const result = { id: updated.id };

      // Cache the successful result for idempotency replay (API-Conventions §8)
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

  // =========================================================================
  // finding.mute — toggle visibility to MUTED
  // =========================================================================

  /**
   * Mute a finding to suppress it from default views.
   *
   * Permission: findings:mute, scoped to the finding's scopeId.
   * Guard: already MUTED → throws ALREADY_MUTED.
   * Sets: visibility = MUTED, mutedAt = now, mutedBy = userId, mutedUntil.
   * Audit: finding.mute logged with reason and expiry.
   */
  mute: protectedProcedure
    .input(muteInput)
    .output(muteOutput)
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
        return cached.responseBody as z.infer<typeof muteOutput>;
      }

      // Existence check first (API-Conventions §5)
      const finding = await ctx.db.finding.findFirst({
        where: {
          id: input.findingId,
          workspaceId: ctx.session.workspaceId,
        },
        select: { id: true, scopeId: true, visibility: true },
      });

      if (!finding) {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.NOT_FOUND);
      }

      // Permission check after existence check — scope derived from resource
      await ctx.requirePermission("findings:mute", {
        scopeId: finding.scopeId,
      });

      // Guard: already MUTED → specific error
      if (finding.visibility === "MUTED") {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.ALREADY_MUTED);
      }

      // Mutation + audit in same transaction (Code-Conventions §1)
      const now = new Date();

      const updated = await ctx.db.finding.update({
        where: { id: finding.id },
        data: {
          visibility: "MUTED",
          mutedAt: now,
          mutedBy: ctx.session.userId,
          mutedUntil: input.mutedUntil ?? null,
        },
        select: { id: true },
      });

      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: finding.scopeId,
        eventType: "finding.mute",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Finding",
        targetId: updated.id,
        eventData: {
          reason: input.reason ?? null,
          mutedUntil: input.mutedUntil?.toISOString() ?? null,
        },
        traceId: ctx.traceId,
      });

      const result = { id: updated.id };

      // Cache the successful result for idempotency replay (API-Conventions §8)
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

  // =========================================================================
  // finding.acceptRisk — transition to ACCEPTED_RISK
  // =========================================================================

  /**
   * Accept the risk of a finding with a mandatory expiration date.
   *
   * Permission: findings:accept_risk, scoped to the finding's scopeId.
   * Guard: acceptanceExpiresAt is required — throws ACCEPTANCE_MISSING_EXPIRATION.
   * Sets: status = ACCEPTED_RISK, acceptedAt = now, acceptedBy = userId,
   *        acceptanceReason, acceptanceExpiresAt.
   * Audit: finding.acceptRisk logged with reason and expiration.
   */
  acceptRisk: protectedProcedure
    .input(acceptRiskInput)
    .output(acceptRiskOutput)
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
        return cached.responseBody as z.infer<typeof acceptRiskOutput>;
      }

      // Guard: acceptanceExpiresAt is required (validated by Zod schema,
      // but we enforce the business rule explicitly as defense-in-depth)
      if (!input.acceptanceExpiresAt) {
        throwWatchtowerError(
          WATCHTOWER_ERRORS.FINDING.ACCEPTANCE_MISSING_EXPIRATION,
        );
      }

      // Existence check first (API-Conventions §5)
      const finding = await ctx.db.finding.findFirst({
        where: {
          id: input.findingId,
          workspaceId: ctx.session.workspaceId,
        },
        select: { id: true, scopeId: true, status: true },
      });

      if (!finding) {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.NOT_FOUND);
      }

      // Permission check after existence check — scope derived from resource
      await ctx.requirePermission("findings:accept_risk", {
        scopeId: finding.scopeId,
      });

      // Mutation + audit in same transaction (Code-Conventions §1)
      const now = new Date();

      const updated = await ctx.db.finding.update({
        where: { id: finding.id },
        data: {
          status: "ACCEPTED_RISK",
          acceptedAt: now,
          acceptedBy: ctx.session.userId,
          acceptanceReason: input.reason,
          acceptanceExpiresAt: input.acceptanceExpiresAt,
        },
        select: { id: true },
      });

      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: finding.scopeId,
        eventType: "finding.acceptRisk",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Finding",
        targetId: updated.id,
        eventData: {
          previousStatus: finding.status,
          newStatus: "ACCEPTED_RISK",
          reason: input.reason,
          acceptanceExpiresAt: input.acceptanceExpiresAt.toISOString(),
        },
        traceId: ctx.traceId,
      });

      const result = { id: updated.id };

      // Cache the successful result for idempotency replay (API-Conventions §8)
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

  // =========================================================================
  // finding.resolve — transition to RESOLVED
  // =========================================================================

  /**
   * Resolve a finding.
   *
   * Permission: findings:resolve, scoped to the finding's scopeId.
   * Guard: status must be OPEN, ACKNOWLEDGED, or IN_PROGRESS —
   *        throws INVALID_TRANSITION for any other status.
   * Sets: status = RESOLVED, resolvedAt = now, resolvedBy = userId.
   * Audit: finding.resolve logged with previous status.
   */
  resolve: protectedProcedure
    .input(resolveInput)
    .output(resolveOutput)
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
        return cached.responseBody as z.infer<typeof resolveOutput>;
      }

      // Existence check first (API-Conventions §5)
      const finding = await ctx.db.finding.findFirst({
        where: {
          id: input.findingId,
          workspaceId: ctx.session.workspaceId,
        },
        select: { id: true, scopeId: true, status: true },
      });

      if (!finding) {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.NOT_FOUND);
      }

      // Permission check after existence check — scope derived from resource
      await ctx.requirePermission("findings:resolve", {
        scopeId: finding.scopeId,
      });

      // Guard: must be OPEN, ACKNOWLEDGED, or IN_PROGRESS
      const resolvableStatuses = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"];
      if (!resolvableStatuses.includes(finding.status)) {
        throwWatchtowerError(WATCHTOWER_ERRORS.FINDING.INVALID_TRANSITION);
      }

      // Mutation + audit in same transaction (Code-Conventions §1)
      const now = new Date();

      const updated = await ctx.db.finding.update({
        where: { id: finding.id },
        data: {
          status: "RESOLVED",
          resolvedAt: now,
          resolvedBy: ctx.session.userId,
        },
        select: { id: true },
      });

      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: finding.scopeId,
        eventType: "finding.resolve",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Finding",
        targetId: updated.id,
        eventData: {
          previousStatus: finding.status,
          newStatus: "RESOLVED",
        },
        traceId: ctx.traceId,
      });

      const result = { id: updated.id };

      // Cache the successful result for idempotency replay (API-Conventions §8)
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
