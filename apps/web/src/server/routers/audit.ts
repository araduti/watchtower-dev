/**
 * Audit router — read-only access to the tamper-evident audit log.
 *
 * Audit events are the immutable record of every state change in the
 * workspace. They form a hash-chained sequence (prevHash → rowHash)
 * that provides cryptographic tamper evidence. This router exposes
 * only the list procedure — audit events are APPEND-ONLY and are
 * never modified or deleted.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #5, API-Conventions §9)
 * - No deletedAt filter — audit events are append-only, never deleted
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 *
 * Security notes:
 * - prevHash, rowHash, signature, and signingKeyId are NEVER exposed
 *   in API responses. Tamper-evidence verification is an internal
 *   system concern, not a user-facing feature.
 * - actorIp and actorUserAgent are excluded from list output to avoid
 *   leaking PII in bulk responses.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc.ts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const actorTypeEnum = z.enum(["USER", "SYSTEM", "API_TOKEN", "PLUGIN"]);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const auditListItem = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scopeId: z.string().nullable(),
  eventType: z.string(),
  actorType: actorTypeEnum,
  actorId: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  eventData: z.unknown(),
  chainSequence: z.number().int(),
  occurredAt: z.coerce.date(),
  recordedAt: z.coerce.date(),
});

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  eventType: z.string().optional(),
  targetType: z.string().optional(),
  actorId: z.string().optional(),
});

const listOutput = z.object({
  items: z.array(auditListItem),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Reusable Prisma selects
// ---------------------------------------------------------------------------

/**
 * Select clause for audit list queries.
 *
 * Intentionally excludes tamper-evidence fields (prevHash, rowHash,
 * signature, signingKeyId) — these are internal integrity mechanisms
 * and not user-facing concerns.
 *
 * Also excludes actorIp, actorUserAgent, traceId, and eventVersion
 * to keep list responses lean and avoid PII leakage in bulk.
 */
const AUDIT_LIST_SELECT = {
  id: true,
  workspaceId: true,
  scopeId: true,
  eventType: true,
  actorType: true,
  actorId: true,
  targetType: true,
  targetId: true,
  eventData: true,
  chainSequence: true,
  occurredAt: true,
  recordedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const auditRouter = router({
  // =========================================================================
  // audit.list — cursor-paginated audit log viewer
  // =========================================================================

  /**
   * List audit events in the current workspace with optional filters.
   *
   * Permission: workspace:view_audit_log (workspace-level, no scope).
   * This is a privileged operation — only workspace admins and
   * compliance officers should have this permission.
   *
   * The audit log is already workspace-scoped via RLS (Layer 3).
   * Layer 2 (explicit SQL filter): workspaceId = session.workspaceId.
   *
   * Filters are allowlisted: eventType, targetType, actorId.
   * No free-form WHERE clauses from user input.
   *
   * Order: chainSequence DESC, id ASC (tiebreaker)
   * This preserves the tamper-evident chain ordering while providing
   * stable pagination for events with the same sequence number.
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("workspace:view_audit_log");

      // Build allowlisted WHERE clause.
      // Layer 2 (explicit SQL filter): restrict to current workspace.
      // Layer 3 (RLS) is the safety net via ctx.db.
      const where = {
        workspaceId: ctx.session.workspaceId,
        ...(input.eventType && { eventType: input.eventType }),
        ...(input.targetType && { targetType: input.targetType }),
        ...(input.actorId && { actorId: input.actorId }),
      };

      // Cursor pagination: fetch limit + 1 to detect next page
      const rows = await ctx.db.auditEvent.findMany({
        where,
        orderBy: [{ chainSequence: "desc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: AUDIT_LIST_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor =
        hasMore ? (items[items.length - 1]?.id ?? null) : null;

      return { items, nextCursor };
    }),
});
