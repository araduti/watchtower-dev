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

const softDeleteInput = z.object({
  idempotencyKey: z.string().uuid(),
});

const softDeleteOutput = z.object({
  id: z.string(),
});

const transferOwnershipInput = z.object({
  idempotencyKey: z.string().uuid(),
  targetUserId: z.string(),
});

const transferOwnershipOutput = z.object({
  id: z.string(),
});

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
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult
   */
  updateSettings: protectedProcedure
    .input(updateSettingsInput)
    .output(updateSettingsOutput)
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
        return cached.responseBody as z.infer<typeof updateSettingsOutput>;
      }

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
      // Hash chain fields (prevHash, rowHash, chainSequence, signature,
      // signingKeyId) are computed by createAuditEvent().
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "workspace.updateSettings",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Workspace",
        targetId: existing.id,
        eventData: changes,
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      await saveIdempotencyResult(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
        updated,
        200,
      );

      return updated;
    }),

  /**
   * Soft-delete the current workspace.
   *
   * Permission: workspace:delete (workspace-level, no scope)
   * Audit: workspace.softDelete logged
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult
   */
  softDelete: protectedProcedure
    .input(softDeleteInput)
    .output(softDeleteOutput)
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
        return cached.responseBody as z.infer<typeof softDeleteOutput>;
      }

      // Existence check first (API-Conventions §5)
      const existing = await ctx.db.workspace.findFirst({
        where: {
          id: ctx.session.workspaceId,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.NOT_FOUND);
      }

      // Guard: workspace already deleted
      if (existing.deletedAt !== null) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.ALREADY_DELETED);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("workspace:delete");

      // Soft-delete and write audit log in the same transaction.
      const updated = await ctx.db.workspace.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
        select: { id: true },
      });

      // Audit log entry — same transaction as the mutation
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "workspace.softDelete",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Workspace",
        targetId: existing.id,
        eventData: {},
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      await saveIdempotencyResult(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
        updated,
        200,
      );

      return updated;
    }),

  /**
   * Transfer workspace ownership to another member.
   *
   * Permission: workspace:transfer_ownership (workspace-level, no scope)
   * Audit: workspace.transferOwnership logged with previousOwner and newOwner
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult
   */
  transferOwnership: protectedProcedure
    .input(transferOwnershipInput)
    .output(transferOwnershipOutput)
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
        return cached.responseBody as z.infer<typeof transferOwnershipOutput>;
      }

      // Existence check first (API-Conventions §5)
      const existing = await ctx.db.workspace.findFirst({
        where: {
          id: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("workspace:transfer_ownership");

      // Guard: target user is current owner
      if (input.targetUserId === ctx.session.userId) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.CANNOT_TRANSFER_TO_SELF);
      }

      // Look up system roles (owner and admin)
      const ownerRole = await ctx.db.role.findFirst({
        where: { slug: "owner", workspaceId: null },
        select: { id: true },
      });

      const adminRole = await ctx.db.role.findFirst({
        where: { slug: "admin", workspaceId: null },
        select: { id: true },
      });

      if (!ownerRole || !adminRole) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "System roles are not configured correctly.",
          cause: {
            errorCode: "WATCHTOWER:WORKSPACE:NOT_FOUND" as const,
          },
        });
      }

      // Find the current owner's membership (the one with "owner" role)
      const currentOwnerMembership = await ctx.db.membership.findFirst({
        where: {
          workspaceId: ctx.session.workspaceId,
          roles: {
            some: { roleId: ownerRole.id },
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!currentOwnerMembership) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.NOT_FOUND);
      }

      // Guard: target user is not a member
      const targetMembership = await ctx.db.membership.findFirst({
        where: {
          workspaceId: ctx.session.workspaceId,
          userId: input.targetUserId,
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!targetMembership) {
        throwWatchtowerError(WATCHTOWER_ERRORS.WORKSPACE.TRANSFER_TARGET_NOT_MEMBER);
      }

      // Remove "owner" role from current owner's membership
      await ctx.db.membershipRole.deleteMany({
        where: {
          membershipId: currentOwnerMembership.id,
          roleId: ownerRole.id,
        },
      });

      // Assign "admin" role to the previous owner
      await ctx.db.membershipRole.create({
        data: {
          membershipId: currentOwnerMembership.id,
          roleId: adminRole.id,
        },
      });

      // Add "owner" role to target user's membership
      await ctx.db.membershipRole.create({
        data: {
          membershipId: targetMembership.id,
          roleId: ownerRole.id,
        },
      });

      // Audit log entry — same transaction as the mutation
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "workspace.transferOwnership",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Workspace",
        targetId: existing.id,
        eventData: {
          previousOwner: currentOwnerMembership.userId,
          newOwner: targetMembership.userId,
        },
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      await saveIdempotencyResult(
        ctx.db,
        ctx.session.workspaceId,
        input.idempotencyKey,
        requestHash,
        { id: existing.id },
        200,
      );

      return { id: existing.id };
    }),
});
