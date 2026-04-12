/**
 * Workspace router — read and update the current workspace.
 *
 * All procedures are workspace-scoped. The workspace is derived from
 * the authenticated session, not from client input.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before mutations (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 * - Audit log in same transaction as mutation (Code-Conventions §1)
 * - deletedAt: null filter (Non-Negotiable #7)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import { throwWatchtowerError } from "../errors.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const workspaceOutput = z.object({
  id: z.string(),
  name: z.string(),
  scopeIsolationMode: z.enum(["SOFT", "STRICT"]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const updateSettingsInput = z.object({
  idempotencyKey: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  scopeIsolationMode: z.enum(["SOFT", "STRICT"]).optional(),
});

const updateSettingsOutput = workspaceOutput;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const workspaceRouter = router({
  /**
   * Get the current workspace's details.
   *
   * Permission: workspace:read (workspace-level, no scope)
   */
  get: protectedProcedure
    .output(workspaceOutput)
    .query(async ({ ctx }) => {
      await ctx.requirePermission("workspace:read");

      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          scopeIsolationMode: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!workspace) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.NOT_FOUND);
      }

      return workspace;
    }),

  /**
   * Update workspace settings.
   *
   * Permission: workspace:edit_settings (workspace-level, no scope)
   * Audit: workspace.updateSettings logged with changed fields
   * Idempotency: required
   */
  updateSettings: protectedProcedure
    .input(updateSettingsInput)
    .output(updateSettingsOutput)
    .mutation(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const existing = await ctx.db.workspace.findFirst({
        where: {
          id: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          scopeIsolationMode: true,
        },
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("workspace:edit_settings");

      // Build update data — only include changed fields
      const data: Record<string, unknown> = {};
      const changes: Record<string, { from: string; to: string }> = {};

      if (input.name !== undefined && input.name !== existing.name) {
        data["name"] = input.name;
        changes["name"] = { from: existing.name, to: input.name };
      }

      if (
        input.scopeIsolationMode !== undefined &&
        input.scopeIsolationMode !== existing.scopeIsolationMode
      ) {
        data["scopeIsolationMode"] = input.scopeIsolationMode;
        changes["scopeIsolationMode"] = {
          from: existing.scopeIsolationMode,
          to: input.scopeIsolationMode,
        };
      }

      // No changes — return current state
      if (Object.keys(data).length === 0) {
        const current = await ctx.db.workspace.findUniqueOrThrow({
          where: { id: existing.id },
          select: {
            id: true,
            name: true,
            scopeIsolationMode: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return current;
      }

      // Update workspace and write audit log in the same transaction.
      // ctx.db is already inside a withRLS() transaction, so both
      // operations share the same transaction boundary.
      const updated = await ctx.db.workspace.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          name: true,
          scopeIsolationMode: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      //
      // NOTE: The hash chain fields (prevHash, rowHash, chainSequence,
      // signature, signingKeyId) are computed by the audit infrastructure.
      // Phase 1.1 writes the business fields; the full chain construction
      // is wired in Phase 1.2 when the AuditSigningKey is loaded at startup.
      // For now, we write placeholder values that maintain the schema contract.
      // This is a known Phase 1.1 limitation documented in ADR-002.
      await ctx.db.auditEvent.create({
        data: {
          workspaceId: ctx.session.workspaceId,
          eventType: "workspace.updateSettings",
          actorType: "USER",
          actorId: ctx.session.userId,
          targetType: "Workspace",
          targetId: existing.id,
          eventData: changes,
          // Placeholder chain fields — will be replaced by audit
          // infrastructure in Phase 1.2
          prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
          rowHash: "0000000000000000000000000000000000000000000000000000000000000000",
          chainSequence: 0,
          signature: "0000000000000000000000000000000000000000000000000000000000000000",
          signingKeyId: "placeholder",
          occurredAt: new Date(),
          traceId: ctx.traceId,
        },
      });

      return updated;
    }),
});
