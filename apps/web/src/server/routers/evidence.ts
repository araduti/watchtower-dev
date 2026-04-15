/**
 * Evidence router — read-only access to compliance evidence records.
 *
 * Evidence is the raw proof collected during scans — each record captures
 * what was observed, when, and by whom. Evidence is APPEND-ONLY; it is
 * never modified or deleted after creation. This router exposes only
 * read procedures.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #5, API-Conventions §9)
 * - No deletedAt filter — evidence is append-only, never deleted
 * - Scope derived from evidence's scopeId, not from input (API-Conventions §5)
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.ts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const evidenceResultEnum = z.enum(["PASS", "FAIL", "ERROR", "NOT_APPLICABLE"]);
const evidenceTypeEnum = z.enum(["AUTOMATED", "MANUAL", "HYBRID"]);
const reviewStatusEnum = z.enum([
  "NOT_REQUIRED",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
]);
const actorTypeEnum = z.enum(["USER", "SYSTEM", "API_TOKEN", "PLUGIN"]);

// ---------------------------------------------------------------------------
// Schemas — list
// ---------------------------------------------------------------------------

const evidenceListItem = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scopeId: z.string(),
  tenantId: z.string(),
  scanId: z.string(),
  findingId: z.string(),
  result: evidenceResultEnum,
  type: evidenceTypeEnum,
  observedAt: z.coerce.date(),
  reviewStatus: reviewStatusEnum,
  fileName: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  mimeType: z.string().nullable(),
});

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  findingId: z.string().optional(),
  scanId: z.string().optional(),
  scopeId: z.string().optional(),
});

const listOutput = z.object({
  items: z.array(evidenceListItem),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Schemas — get (full detail)
// ---------------------------------------------------------------------------

const evidenceDetail = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scopeId: z.string(),
  tenantId: z.string(),
  scanId: z.string(),
  findingId: z.string(),
  result: evidenceResultEnum,
  rawEvidence: z.unknown(),
  type: evidenceTypeEnum,
  storageKey: z.string().nullable(),
  fileName: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  mimeType: z.string().nullable(),
  url: z.string().nullable(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable(),
  collectedBy: actorTypeEnum,
  collectedById: z.string(),
  reviewStatus: reviewStatusEnum,
  reviewedBy: z.string().nullable(),
  reviewedAt: z.coerce.date().nullable(),
  reviewNotes: z.string().nullable(),
  observedAt: z.coerce.date(),
});

const getInput = z.object({
  evidenceId: z.string(),
});

// ---------------------------------------------------------------------------
// Reusable Prisma selects
// ---------------------------------------------------------------------------

/**
 * Select clause for list queries — lightweight, excludes rawEvidence and value
 * which can be very large JSON blobs.
 */
const EVIDENCE_LIST_SELECT = {
  id: true,
  workspaceId: true,
  scopeId: true,
  tenantId: true,
  scanId: true,
  findingId: true,
  result: true,
  type: true,
  observedAt: true,
  reviewStatus: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
} as const;

/**
 * Select clause for detail queries — full evidence record including
 * rawEvidence, but excluding `value` (internal engine use only).
 */
const EVIDENCE_DETAIL_SELECT = {
  id: true,
  workspaceId: true,
  scopeId: true,
  tenantId: true,
  scanId: true,
  findingId: true,
  result: true,
  rawEvidence: true,
  type: true,
  storageKey: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  url: true,
  validFrom: true,
  validUntil: true,
  collectedBy: true,
  collectedById: true,
  reviewStatus: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  observedAt: true,
  // NOTE: `value` is intentionally excluded — it is an internal field
  // used by the compliance engine, not exposed via the API.
} as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const evidenceRouter = router({
  // =========================================================================
  // evidence.list — cursor-paginated evidence listing
  // =========================================================================

  /**
   * List evidence records in the current workspace with optional filters.
   *
   * Permission: evidence:read (no scope — the query itself filters by
   * accessible scopes via RLS and explicit WHERE).
   *
   * Per API-Conventions §5: "For list, the check is
   * ctx.requirePermission('...') (no scope), then the SQL query
   * filters by scopeId IN (user's accessible scopes)."
   *
   * NEVER returns rawEvidence or value in list output — these can be
   * arbitrarily large JSON blobs and would bloat list responses.
   *
   * Order: observedAt DESC, id ASC
   * (matches the composite index on [workspaceId, scopeId, observedAt])
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("evidence:read");

      // Build allowlisted WHERE clause.
      // Layer 2 (explicit SQL filter): restrict to workspace and accessible scopes.
      // Layer 3 (RLS) is the safety net via ctx.db.
      const where = {
        workspaceId: ctx.session.workspaceId,
        scopeId: { in: ctx.permissionContext.accessibleScopeIds },
        ...(input.findingId && { findingId: input.findingId }),
        ...(input.scanId && { scanId: input.scanId }),
        ...(input.scopeId && { scopeId: input.scopeId }),
      };

      // Cursor pagination: fetch limit + 1 to detect next page
      const rows = await ctx.db.evidence.findMany({
        where,
        orderBy: [{ observedAt: "desc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: EVIDENCE_LIST_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor =
        hasMore ? (items[items.length - 1]?.id ?? null) : null;

      return { items, nextCursor };
    }),

  // =========================================================================
  // evidence.get — single evidence by ID
  // =========================================================================

  /**
   * Get a single evidence record by ID with full details.
   *
   * Permission: evidence:read, scoped to the evidence's scopeId.
   * Existence check first, then permission check (API-Conventions §5).
   * Scope derived from the resource, not from input.
   *
   * Returns full details including rawEvidence but NOT value (internal).
   */
  get: protectedProcedure
    .input(getInput)
    .output(evidenceDetail)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const evidence = await ctx.db.evidence.findFirst({
        where: {
          id: input.evidenceId,
          workspaceId: ctx.session.workspaceId,
        },
        select: EVIDENCE_DETAIL_SELECT,
      });

      if (!evidence) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Evidence not found.",
          cause: { errorCode: "WATCHTOWER:EVIDENCE:NOT_FOUND" },
        });
      }

      // Permission check after existence check — scope derived from resource
      await ctx.requirePermission("evidence:read", {
        scopeId: evidence.scopeId,
      });

      return evidence;
    }),
});
