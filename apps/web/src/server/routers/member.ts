/**
 * Member router — manage workspace memberships and role assignments.
 *
 * Memberships sit at the Workspace level (optionally scoped). Each
 * membership links a user to a workspace with one or more roles.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before mutations (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #5, API-Conventions §9)
 * - Membership is hard-deleted (not soft-deleted)
 * - Members are workspace-level (WORKSPACE_ONLY permissions)
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
// Schemas
// ---------------------------------------------------------------------------

/** Role summary embedded in membership output. */
const roleOutput = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

/** Output schema for a membership, including its assigned roles. */
const memberOutput = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  scopeId: z.string().nullable(),
  roles: z.array(roleOutput),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Reusable Prisma select clause for membership queries.
 * Always includes nested role data via the MembershipRole join table.
 */
const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  workspaceId: true,
  scopeId: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
} as const;

/**
 * Flatten the Prisma nested `roles: { role: { ... } }[]` shape into
 * the output schema's `roles: { id, name, slug }[]`.
 */
function flattenRoles<
  T extends { roles: { role: { id: string; name: string; slug: string } }[] },
>(membership: T) {
  const { roles, ...rest } = membership;
  return {
    ...rest,
    roles: roles.map((mr) => mr.role),
  };
}

// -- list --
const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const listOutput = z.object({
  items: z.array(memberOutput),
  nextCursor: z.string().nullable(),
});

// -- get --
const getInput = z.object({
  membershipId: z.string(),
});

// -- invite --
const inviteInput = z.object({
  idempotencyKey: z.string().uuid(),
  userId: z.string(),
  scopeId: z.string().optional(),
  roleIds: z.array(z.string()).min(1),
});

const inviteOutput = memberOutput;

// -- remove --
const removeInput = z.object({
  idempotencyKey: z.string().uuid(),
  membershipId: z.string(),
});

const removeOutput = z.object({
  id: z.string(),
});

// -- updateRole --
const updateRoleInput = z.object({
  idempotencyKey: z.string().uuid(),
  membershipId: z.string(),
  roleIds: z.array(z.string()).min(1),
});

const updateRoleOutput = memberOutput;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const memberRouter = router({
  /**
   * List workspace memberships.
   *
   * Permission: members:read (workspace-level, no scope).
   * Cursor-based pagination using `id` as the cursor.
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("members:read");

      const rows = await ctx.db.membership.findMany({
        where: {
          workspaceId: ctx.session.workspaceId,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: MEMBERSHIP_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor = hasMore
        ? (items[items.length - 1]?.id ?? null)
        : null;

      return {
        items: items.map(flattenRoles),
        nextCursor,
      };
    }),

  /**
   * Get a single membership by ID.
   *
   * Permission: members:read (workspace-level, no scope).
   * Existence check first, then permission check (API-Conventions §5).
   */
  get: protectedProcedure
    .input(getInput)
    .output(memberOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const membership = await ctx.db.membership.findFirst({
        where: {
          id: input.membershipId,
          workspaceId: ctx.session.workspaceId,
        },
        select: MEMBERSHIP_SELECT,
      });

      if (!membership) {
        throwWatchtowerError(WATCHTOWER_ERRORS.MEMBER.NOT_FOUND);
      }

      // Permission check after existence check — workspace-level only
      await ctx.requirePermission("members:read");

      return flattenRoles(membership);
    }),

  /**
   * Invite a user to the workspace by creating a membership.
   *
   * Permission: members:invite (workspace-level, no scope).
   * Checks for existing membership to prevent duplicates.
   * Creates Membership + MembershipRole records in the same transaction.
   * Audit: member.invite logged with userId and roleIds.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  invite: protectedProcedure
    .input(inviteInput)
    .output(inviteOutput)
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
        return cached.responseBody as z.infer<typeof inviteOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("members:invite");

      // Check for existing membership (unique on userId + workspaceId + scopeId)
      const existing = await ctx.db.membership.findFirst({
        where: {
          userId: input.userId,
          workspaceId: ctx.session.workspaceId,
          scopeId: input.scopeId ?? null,
        },
        select: { id: true },
      });

      if (existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.MEMBER.ALREADY_MEMBER);
      }

      // Create membership with role assignments
      const created = await ctx.db.membership.create({
        data: {
          userId: input.userId,
          workspaceId: ctx.session.workspaceId,
          scopeId: input.scopeId ?? null,
          roles: {
            create: input.roleIds.map((roleId) => ({
              roleId,
            })),
          },
        },
        select: MEMBERSHIP_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: input.scopeId ?? null,
        eventType: "member.invite",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Membership",
        targetId: created.id,
        eventData: {
          userId: input.userId,
          roleIds: input.roleIds,
        },
        traceId: ctx.traceId,
      });

      const result = flattenRoles(created);

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

  /**
   * Remove a membership from the workspace.
   *
   * Permission: members:remove (workspace-level, no scope).
   * Cannot remove a member who holds the "owner" role — throws CANNOT_REMOVE_OWNER.
   * Hard-deletes MembershipRole records, then the Membership itself.
   * Audit: member.remove logged with membership details.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  remove: protectedProcedure
    .input(removeInput)
    .output(removeOutput)
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
        return cached.responseBody as z.infer<typeof removeOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("members:remove");

      // Existence check
      const membership = await ctx.db.membership.findFirst({
        where: {
          id: input.membershipId,
          workspaceId: ctx.session.workspaceId,
        },
        select: {
          id: true,
          userId: true,
          scopeId: true,
          roles: {
            select: {
              role: {
                select: { slug: true },
              },
            },
          },
        },
      });

      if (!membership) {
        throwWatchtowerError(WATCHTOWER_ERRORS.MEMBER.NOT_FOUND);
      }

      // Check if any role in the membership has slug "owner" — cannot remove owner
      const hasOwnerRole = membership.roles.some(
        (mr) => mr.role.slug === "owner",
      );
      if (hasOwnerRole) {
        throwWatchtowerError(WATCHTOWER_ERRORS.MEMBER.CANNOT_REMOVE_OWNER);
      }

      // Delete MembershipRole records first (referential integrity)
      await ctx.db.membershipRole.deleteMany({
        where: { membershipId: membership.id },
      });

      // Delete the Membership (hard-delete)
      await ctx.db.membership.delete({
        where: { id: membership.id },
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: membership.scopeId,
        eventType: "member.remove",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Membership",
        targetId: membership.id,
        eventData: {
          userId: membership.userId,
        },
        traceId: ctx.traceId,
      });

      const result = { id: membership.id };

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

  /**
   * Update role assignments for a membership.
   *
   * Permission: members:edit_roles (workspace-level, no scope).
   * Replaces all existing roles with the new set (delete-then-create).
   * Audit: member.updateRole logged with old and new roleIds.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  updateRole: protectedProcedure
    .input(updateRoleInput)
    .output(updateRoleOutput)
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
        return cached.responseBody as z.infer<typeof updateRoleOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("members:edit_roles");

      // Existence check
      const membership = await ctx.db.membership.findFirst({
        where: {
          id: input.membershipId,
          workspaceId: ctx.session.workspaceId,
        },
        select: {
          id: true,
          scopeId: true,
          roles: {
            select: {
              roleId: true,
            },
          },
        },
      });

      if (!membership) {
        throwWatchtowerError(WATCHTOWER_ERRORS.MEMBER.NOT_FOUND);
      }

      // Capture previous roleIds for audit trail
      const previousRoleIds = membership.roles.map((mr) => mr.roleId);

      // Delete existing role assignments
      await ctx.db.membershipRole.deleteMany({
        where: { membershipId: membership.id },
      });

      // Create new role assignments
      await ctx.db.membershipRole.createMany({
        data: input.roleIds.map((roleId) => ({
          membershipId: membership.id,
          roleId,
        })),
      });

      // Re-fetch the updated membership with full role data
      const updated = await ctx.db.membership.findUniqueOrThrow({
        where: { id: membership.id },
        select: MEMBERSHIP_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: membership.scopeId,
        eventType: "member.updateRole",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Membership",
        targetId: membership.id,
        eventData: {
          previousRoleIds,
          newRoleIds: input.roleIds,
        },
        traceId: ctx.traceId,
      });

      const result = flattenRoles(updated);

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
