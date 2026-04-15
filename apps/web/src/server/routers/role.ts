/**
 * Role router — manage workspace roles and permission assignments.
 *
 * Roles come in two flavours:
 * - **System roles** — `isSystem: true`, `workspaceId: null`. Immutable
 *   presets seeded at startup. Visible to all workspaces but cannot be
 *   updated or deleted.
 * - **Custom roles** — `isSystem: false`, `workspaceId: <wid>`. Created
 *   by workspace admins. May be updated, deleted, and assigned any
 *   permission where `assignableToCustomRoles = true`.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before mutations (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #5, API-Conventions §9)
 * - Roles are hard-deleted (not soft-deleted)
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

/** Permission summary embedded in role output. */
const permissionOutput = z.object({
  key: z.string(),
  category: z.string(),
});

/** Output schema for a role, including its assigned permissions. */
const roleOutput = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  isAssignable: z.boolean(),
  permissions: z.array(permissionOutput),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Reusable Prisma select clause for role queries.
 * Always includes nested permission data via the RolePermission join table.
 */
const ROLE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isSystem: true,
  isAssignable: true,
  createdAt: true,
  updatedAt: true,
  permissions: {
    select: {
      permission: {
        select: {
          key: true,
          category: true,
        },
      },
    },
  },
} as const;

/**
 * Flatten the Prisma nested `permissions: { permission: { ... } }[]` shape
 * into the output schema's `permissions: { key, category }[]`.
 */
function flattenPermissions(
  role: {
    permissions: { permission: { key: string; category: string } }[];
    [key: string]: unknown;
  },
) {
  return {
    ...role,
    permissions: role.permissions.map((rp) => rp.permission),
  };
}

// -- list --
const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const listOutput = z.object({
  items: z.array(roleOutput),
  nextCursor: z.string().nullable(),
});

// -- get --
const getInput = z.object({
  roleId: z.string(),
});

// -- create --
const createInput = z.object({
  idempotencyKey: z.string().uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  permissionKeys: z.array(z.string()).min(1),
});

const createOutput = roleOutput;

// -- update --
const updateInput = z.object({
  idempotencyKey: z.string().uuid(),
  roleId: z.string(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  permissionKeys: z.array(z.string()).min(1).optional(),
});

const updateOutput = roleOutput;

// -- delete --
const deleteInput = z.object({
  idempotencyKey: z.string().uuid(),
  roleId: z.string(),
});

const deleteOutput = z.object({
  id: z.string(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that none of the requested permission keys are locked
 * (`assignableToCustomRoles = false`). Throws LOCKED_PERMISSION if any
 * restricted keys are found.
 *
 * @param db             - The RLS-scoped Prisma transaction client.
 * @param permissionKeys - Permission keys the caller wants to assign.
 */
async function validateNoLockedPermissions(
  db: Parameters<typeof createAuditEvent>[0],
  permissionKeys: string[],
): Promise<void> {
  const locked = await db.permission.findMany({
    where: {
      key: { in: permissionKeys },
      assignableToCustomRoles: false,
    },
    select: { key: true },
  });

  if (locked.length > 0) {
    throwWatchtowerError(WATCHTOWER_ERRORS.ROLE.LOCKED_PERMISSION, {
      message: `The following permissions cannot be assigned to custom roles: ${locked.map((p) => p.key).join(", ")}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const roleRouter = router({
  /**
   * List roles visible to the current workspace.
   *
   * Returns both system roles (workspaceId = null) and custom roles
   * belonging to the current workspace.
   *
   * Permission: roles:read (workspace-level, no scope).
   * Cursor-based pagination using `id` as the cursor.
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("roles:read");

      const rows = await ctx.db.role.findMany({
        where: {
          OR: [
            { workspaceId: null },
            { workspaceId: ctx.session.workspaceId },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: ROLE_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor = hasMore
        ? (items[items.length - 1]?.id ?? null)
        : null;

      return {
        items: items.map(flattenPermissions),
        nextCursor,
      };
    }),

  /**
   * Get a single role by ID.
   *
   * Permission: roles:read (workspace-level, no scope).
   * Role must be a system role (workspaceId null) or belong to the
   * current workspace. Returns NOT_FOUND otherwise (no existence leak).
   */
  get: protectedProcedure
    .input(getInput)
    .output(roleOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first — use OR to include system roles
      const role = await ctx.db.role.findFirst({
        where: {
          id: input.roleId,
          OR: [
            { workspaceId: null },
            { workspaceId: ctx.session.workspaceId },
          ],
        },
        select: ROLE_SELECT,
      });

      if (!role) {
        throwWatchtowerError(WATCHTOWER_ERRORS.ROLE.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("roles:read");

      return flattenPermissions(role);
    }),

  /**
   * Create a custom role in the current workspace.
   *
   * Permission: roles:create (workspace-level, no scope).
   * Validates that none of the requested permissions are locked
   * (assignableToCustomRoles = false).
   *
   * Creates the Role record and its RolePermission join records.
   * Audit: role.create logged with name, slug, and permissionKeys.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  create: protectedProcedure
    .input(createInput)
    .output(createOutput)
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
        return cached.responseBody as z.infer<typeof createOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("roles:create");

      // Validate no locked permissions in the requested set
      await validateNoLockedPermissions(ctx.db, input.permissionKeys);

      // Create role with permission assignments
      const created = await ctx.db.role.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          isSystem: false,
          workspaceId: ctx.session.workspaceId,
          permissions: {
            create: input.permissionKeys.map((permissionKey) => ({
              permissionKey,
            })),
          },
        },
        select: ROLE_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "role.create",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Role",
        targetId: created.id,
        eventData: {
          name: input.name,
          slug: input.slug,
          permissionKeys: input.permissionKeys,
        },
        traceId: ctx.traceId,
      });

      const result = flattenPermissions(created);

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
   * Update a custom role.
   *
   * Permission: roles:edit (workspace-level, no scope).
   * System roles (isSystem = true) cannot be modified — throws
   * SYSTEM_ROLE_IMMUTABLE.
   *
   * If `permissionKeys` is provided, validates no locked permissions,
   * then replaces all existing RolePermission records (delete-then-create).
   * Audit: role.update logged with changed fields.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  update: protectedProcedure
    .input(updateInput)
    .output(updateOutput)
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
        return cached.responseBody as z.infer<typeof updateOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("roles:edit");

      // Existence check — only workspace-scoped custom roles can be updated
      const role = await ctx.db.role.findFirst({
        where: {
          id: input.roleId,
          workspaceId: ctx.session.workspaceId,
        },
        select: {
          id: true,
          isSystem: true,
          permissions: {
            select: { permissionKey: true },
          },
        },
      });

      if (!role) {
        throwWatchtowerError(WATCHTOWER_ERRORS.ROLE.NOT_FOUND);
      }

      // System roles are immutable
      if (role.isSystem) {
        throwWatchtowerError(WATCHTOWER_ERRORS.ROLE.SYSTEM_ROLE_IMMUTABLE);
      }

      // Capture previous permission keys for audit trail before any mutations
      const previousPermissionKeys = role.permissions.map(
        (rp) => rp.permissionKey,
      );

      // If permissionKeys provided, validate no locked permissions
      if (input.permissionKeys) {
        await validateNoLockedPermissions(ctx.db, input.permissionKeys);
      }

      // Build update data — only include fields that were provided
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) {
        data["name"] = input.name;
      }
      if (input.description !== undefined) {
        data["description"] = input.description;
      }

      // Update the role's scalar fields
      if (Object.keys(data).length > 0) {
        await ctx.db.role.update({
          where: { id: role.id },
          data,
        });
      }

      // Replace permission assignments if provided
      if (input.permissionKeys) {
        // Delete existing permission assignments
        await ctx.db.rolePermission.deleteMany({
          where: { roleId: role.id },
        });

        // Create new permission assignments
        await ctx.db.rolePermission.createMany({
          data: input.permissionKeys.map((permissionKey) => ({
            roleId: role.id,
            permissionKey,
          })),
        });
      }

      // Re-fetch the updated role with full permission data
      const updated = await ctx.db.role.findUniqueOrThrow({
        where: { id: role.id },
        select: ROLE_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "role.update",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Role",
        targetId: role.id,
        eventData: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.permissionKeys
            ? {
                previousPermissionKeys,
                newPermissionKeys: input.permissionKeys,
              }
            : {}),
        },
        traceId: ctx.traceId,
      });

      const result = flattenPermissions(updated);

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
   * Delete a custom role.
   *
   * Permission: roles:delete (workspace-level, no scope).
   * System roles (isSystem = true) cannot be deleted — throws
   * SYSTEM_ROLE_IMMUTABLE.
   *
   * Hard-deletes RolePermission records, then the Role itself.
   * Audit: role.delete logged with role metadata.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
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
        return cached.responseBody as z.infer<typeof deleteOutput>;
      }

      // Permission check — workspace-level only
      await ctx.requirePermission("roles:delete");

      // Existence check — only workspace-scoped custom roles can be deleted
      const role = await ctx.db.role.findFirst({
        where: {
          id: input.roleId,
          workspaceId: ctx.session.workspaceId,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isSystem: true,
        },
      });

      if (!role) {
        throwWatchtowerError(WATCHTOWER_ERRORS.ROLE.NOT_FOUND);
      }

      // System roles are immutable
      if (role.isSystem) {
        throwWatchtowerError(WATCHTOWER_ERRORS.ROLE.SYSTEM_ROLE_IMMUTABLE);
      }

      // Delete RolePermission records first (referential integrity)
      await ctx.db.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      // Delete the Role (hard-delete)
      await ctx.db.role.delete({
        where: { id: role.id },
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        eventType: "role.delete",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Role",
        targetId: role.id,
        eventData: {
          name: role.name,
          slug: role.slug,
        },
        traceId: ctx.traceId,
      });

      const result = { id: role.id };

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
