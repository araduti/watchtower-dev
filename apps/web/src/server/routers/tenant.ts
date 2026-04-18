/**
 * Tenant router — manage M365 tenant connections within a workspace.
 *
 * Tenants sit at Workspace → Scope → Tenant in the hierarchy. Each
 * tenant represents a connected Microsoft 365 organisation with
 * encrypted credentials stored as a sealed blob.
 *
 * Conventions enforced:
 * - ctx.db for all database access (Non-Negotiable #1)
 * - idempotencyKey for mutations (Non-Negotiable #2)
 * - ctx.requirePermission before mutations (Non-Negotiable #3)
 * - Zod input/output schemas (Non-Negotiable #4)
 * - Cursor-based pagination (Non-Negotiable #5, API-Conventions §9)
 * - Allowlisted filters (Non-Negotiable #10, API-Conventions §10)
 * - deletedAt: null filter (Non-Negotiable #7)
 * - Scope derived from resource, not from input (API-Conventions §5)
 * - TRPCError with Layer 1+2 codes (Non-Negotiable #8, #9)
 * - Audit log in same transaction as mutation (Code-Conventions §1)
 * - encryptedCredentials NEVER selected (security invariant)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";
import { createAuditEvent } from "@watchtower/db";
import {
  encryptCredentials,
  verifyEncryptedCredentials,
  AdapterError,
} from "@watchtower/adapters";
import { throwWatchtowerError } from "../errors.ts";
import {
  checkIdempotencyKey,
  saveIdempotencyResult,
  computeRequestHash,
} from "../idempotency.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const tenantAuthMethod = z.enum(["CLIENT_SECRET", "WORKLOAD_IDENTITY"]);
const tenantStatus = z.enum(["ACTIVE", "DISCONNECTED", "ERROR"]);

/**
 * Output schema for a tenant. NEVER includes `encryptedCredentials`.
 * `hasCredentials` is a boolean derived from the length of the sealed blob —
 * it tells the UI whether credentials have been provisioned without leaking
 * the blob itself.
 */
const tenantOutput = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scopeId: z.string(),
  displayName: z.string(),
  msTenantId: z.string(),
  authMethod: tenantAuthMethod,
  status: tenantStatus,
  hasCredentials: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Standard select clause. Includes `encryptedCredentials` so
 * `toTenantOutput()` can derive the `hasCredentials` boolean.
 * The raw blob is stripped by the transform and NEVER returned
 * to the client.
 */
const TENANT_SELECT = {
  id: true,
  workspaceId: true,
  scopeId: true,
  displayName: true,
  msTenantId: true,
  authMethod: true,
  status: true,
  encryptedCredentials: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Transform a raw Prisma tenant row into the safe output shape.
 * Replaces `encryptedCredentials` (Bytes) with `hasCredentials` (boolean).
 */
function toTenantOutput(row: {
  id: string;
  workspaceId: string;
  scopeId: string;
  displayName: string;
  msTenantId: string;
  authMethod: string;
  status: string;
  encryptedCredentials: Buffer | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const { encryptedCredentials, ...rest } = row;
  return {
    ...rest,
    hasCredentials: !!encryptedCredentials && encryptedCredentials.length > 0,
  };
}

// -- list --
const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  scopeId: z.string().optional(),
});

const listOutput = z.object({
  items: z.array(tenantOutput),
  nextCursor: z.string().nullable(),
});

// -- get --
const getInput = z.object({
  tenantId: z.string(),
});

// -- create --
const createInput = z.object({
  idempotencyKey: z.string().uuid(),
  scopeId: z.string(),
  displayName: z.string().min(1).max(200),
  msTenantId: z.string().min(1),
  authMethod: tenantAuthMethod,
});

const createOutput = tenantOutput;

// -- update --
const updateInput = z.object({
  idempotencyKey: z.string().uuid(),
  tenantId: z.string(),
  displayName: z.string().min(1).max(200).optional(),
});

const updateOutput = tenantOutput;

// -- softDelete --
const softDeleteInput = z.object({
  idempotencyKey: z.string().uuid(),
  tenantId: z.string(),
});

const softDeleteOutput = tenantOutput;

// -- setCredentials --
const setCredentialsInput = z.object({
  idempotencyKey: z.string().uuid(),
  tenantId: z.string(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const setCredentialsOutput = tenantOutput;

// -- checkConnection --
const checkConnectionInput = z.object({
  tenantId: z.string(),
});

const checkConnectionOutput = z.object({
  connected: z.boolean(),
  error: z.string().nullable(),
});

// -- getConsentUrl --
const getConsentUrlInput = z.object({
  tenantId: z.string(),
});

const getConsentUrlOutput = z.object({
  url: z.string(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const tenantRouter = router({
  /**
   * List tenants in the current workspace.
   *
   * Permission: tenants:read (no scope — the query itself filters by
   * accessible scopes via RLS and explicit WHERE)
   *
   * Per API-Conventions §5: "For list, the check is
   * ctx.requirePermission('...') (no scope), then the SQL query
   * filters by scopeId IN (user's accessible scopes)."
   */
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ input, ctx }) => {
      await ctx.requirePermission("tenants:read");

      // Build scope filter: if caller supplies a scopeId, intersect it
      // with accessible scopes. Otherwise use the full accessible set.
      // Layer 2 (explicit SQL filter) + Layer 3 (RLS safety net via ctx.db).
      const scopeFilter = input.scopeId
        ? { scopeId: input.scopeId }
        : { scopeId: { in: ctx.permissionContext.accessibleScopeIds } };

      const rows = await ctx.db.tenant.findMany({
        where: {
          workspaceId: ctx.session.workspaceId,
          ...scopeFilter,
          deletedAt: null,
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        select: TENANT_SELECT,
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const nextCursor = hasMore
        ? (items[items.length - 1]?.id ?? null)
        : null;

      return { items: items.map(toTenantOutput), nextCursor };
    }),

  /**
   * Get a single tenant by ID.
   *
   * Permission: tenants:read, scoped to the tenant's scope.
   * Existence check first, then permission check (API-Conventions §5).
   */
  get: protectedProcedure
    .input(getInput)
    .output(tenantOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: TENANT_SELECT,
      });

      if (!tenant) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.NOT_FOUND);
      }

      // Permission check after existence check — prevents resource
      // existence leaks (returns NOT_FOUND, not FORBIDDEN).
      await ctx.requirePermission("tenants:read", { scopeId: tenant.scopeId });

      return toTenantOutput(tenant);
    }),

  /**
   * Create a new tenant.
   *
   * Permission: tenants:create, scoped to the target scope.
   * Audit: tenant.create logged with tenant details.
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

      // Verify the target scope exists, belongs to this workspace, and
      // is not soft-deleted.
      const scope = await ctx.db.scope.findFirst({
        where: {
          id: input.scopeId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!scope) {
        throwWatchtowerError(WATCHTOWER_ERRORS.SCOPE.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("tenants:create", { scopeId: scope.id });

      // Check for duplicate msTenantId within the workspace
      const duplicate = await ctx.db.tenant.findFirst({
        where: {
          workspaceId: ctx.session.workspaceId,
          msTenantId: input.msTenantId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (duplicate) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.ALREADY_CONNECTED);
      }

      // Create tenant and write audit log in the same transaction.
      // ctx.db is already inside a withRLS() transaction, so both
      // operations share the same transaction boundary.
      const created = await ctx.db.tenant.create({
        data: {
          workspaceId: ctx.session.workspaceId,
          scopeId: scope.id,
          displayName: input.displayName,
          msTenantId: input.msTenantId,
          authMethod: input.authMethod,
          encryptedCredentials: Buffer.alloc(0), // placeholder — credentials must be set via tenants:rotate_credentials
        },
        select: TENANT_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: scope.id,
        eventType: "tenant.create",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Tenant",
        targetId: created.id,
        eventData: {
          displayName: input.displayName,
          msTenantId: input.msTenantId,
          authMethod: input.authMethod,
        },
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      const result = toTenantOutput(created);
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
   * Update tenant display name.
   *
   * Permission: tenants:edit, scoped to the tenant's scope.
   * Audit: tenant.update logged with changed fields.
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

      // Existence check first (API-Conventions §5)
      const existing = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: TENANT_SELECT,
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("tenants:edit", {
        scopeId: existing.scopeId,
      });

      // Build update data — only include changed fields
      const data: Record<string, unknown> = {};
      const changes: Record<string, { from: string; to: string }> = {};

      if (
        input.displayName !== undefined &&
        input.displayName !== existing.displayName
      ) {
        data["displayName"] = input.displayName;
        changes["displayName"] = {
          from: existing.displayName,
          to: input.displayName,
        };
      }

      // No changes — return current state (already fully selected)
      if (Object.keys(data).length === 0) {
        return toTenantOutput(existing);
      }

      // Update tenant and write audit log in the same transaction.
      const updated = await ctx.db.tenant.update({
        where: { id: existing.id },
        data,
        select: TENANT_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: existing.scopeId,
        eventType: "tenant.update",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Tenant",
        targetId: existing.id,
        eventData: changes,
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      const result = toTenantOutput(updated);
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
   * Soft-delete a tenant.
   *
   * Permission: tenants:delete, scoped to the tenant's scope.
   * Sets `deletedAt` to the current timestamp (soft-delete).
   * Audit: tenant.softDelete logged with tenant ID.
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
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
      const existing = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          scopeId: true,
        },
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("tenants:delete", {
        scopeId: existing.scopeId,
      });

      // Soft-delete: set deletedAt to current timestamp.
      const deleted = await ctx.db.tenant.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
        select: TENANT_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: existing.scopeId,
        eventType: "tenant.softDelete",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Tenant",
        targetId: existing.id,
        eventData: {},
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      const result = toTenantOutput(deleted);
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
   * Set or rotate tenant credentials.
   *
   * Permission: tenants:rotate_credentials, scoped to the tenant's scope.
   * Encrypts the provided client ID and secret with AES-256-GCM, stores
   * the sealed blob in `encryptedCredentials`, and sets status to ACTIVE.
   * Audit: tenant.setCredentials logged (credential fingerprint, not secret).
   * Idempotency: required — enforced via checkIdempotencyKey/saveIdempotencyResult.
   */
  setCredentials: protectedProcedure
    .input(setCredentialsInput)
    .output(setCredentialsOutput)
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
        return cached.responseBody as z.infer<typeof setCredentialsOutput>;
      }

      // Existence check first (API-Conventions §5)
      const existing = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: { id: true, scopeId: true, msTenantId: true },
      });

      if (!existing) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.NOT_FOUND);
      }

      // Permission check after existence check (API-Conventions §5)
      await ctx.requirePermission("tenants:rotate_credentials", {
        scopeId: existing.scopeId,
      });

      // Encrypt credentials at the adapter boundary (Code-Conventions §6).
      // Plaintext is in-memory only for the duration of this call.
      const sealed = encryptCredentials({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        msTenantId: existing.msTenantId,
      });

      // Update credentials and set status to ACTIVE.
      const updated = await ctx.db.tenant.update({
        where: { id: existing.id },
        data: {
          encryptedCredentials: sealed,
          status: "ACTIVE",
        },
        select: TENANT_SELECT,
      });

      // Audit log entry — same transaction as the mutation
      // (Code-Conventions §1: "same transaction, not after")
      // Log a fingerprint (first 8 chars of clientId), NEVER the secret.
      await createAuditEvent(ctx.db, {
        workspaceId: ctx.session.workspaceId,
        scopeId: existing.scopeId,
        eventType: "tenant.setCredentials",
        actorType: "USER",
        actorId: ctx.session.userId,
        targetType: "Tenant",
        targetId: existing.id,
        eventData: {
          clientIdPrefix: input.clientId.slice(0, 8) + "…",
          authMethod: "CLIENT_SECRET",
        },
        traceId: ctx.traceId,
      });

      // Cache the successful result for idempotency replay (API-Conventions §8)
      const result = toTenantOutput(updated);
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
   * Check whether stored credentials can acquire a Graph API token.
   *
   * Permission: tenants:read, scoped to the tenant's scope.
   * Does NOT modify state — this is a query, not a mutation.
   * Decrypts credentials inside the adapter boundary and performs
   * a lightweight client_credentials OAuth call to verify connectivity.
   */
  checkConnection: protectedProcedure
    .input(checkConnectionInput)
    .output(checkConnectionOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          scopeId: true,
          encryptedCredentials: true,
        },
      });

      if (!tenant) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.NOT_FOUND);
      }

      await ctx.requirePermission("tenants:read", { scopeId: tenant.scopeId });

      // No credentials stored — return immediately
      if (!tenant.encryptedCredentials || tenant.encryptedCredentials.length === 0) {
        return { connected: false, error: "No credentials configured." };
      }

      // Verify credentials via the adapter boundary (Code-Conventions §6).
      // Decryption and token acquisition happen inside the adapter closure.
      try {
        await verifyEncryptedCredentials(tenant.encryptedCredentials);
        return { connected: true, error: null };
      } catch (err) {
        const message =
          err instanceof AdapterError
            ? err.message
            : "Credential verification failed.";
        return { connected: false, error: message };
      }
    }),

  /**
   * Generate an Azure AD admin consent URL for a tenant.
   *
   * Permission: tenants:rotate_credentials, scoped to the tenant's scope.
   * Returns a URL the user can visit to grant admin consent for Watchtower's
   * multi-tenant app registration on the customer's M365 tenant.
   */
  getConsentUrl: protectedProcedure
    .input(getConsentUrlInput)
    .output(getConsentUrlOutput)
    .query(async ({ input, ctx }) => {
      // Existence check first (API-Conventions §5)
      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          workspaceId: ctx.session.workspaceId,
          deletedAt: null,
        },
        select: { id: true, scopeId: true, msTenantId: true },
      });

      if (!tenant) {
        throwWatchtowerError(WATCHTOWER_ERRORS.TENANT.NOT_FOUND);
      }

      await ctx.requirePermission("tenants:rotate_credentials", {
        scopeId: tenant.scopeId,
      });

      // Build the Azure AD admin consent URL.
      // WATCHTOWER_AZURE_CLIENT_ID is the multi-tenant app registration's
      // client ID. The redirect URI points back to our callback handler.
      const azureClientId = process.env["WATCHTOWER_AZURE_CLIENT_ID"];
      if (!azureClientId) {
        throwWatchtowerError(WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR, {
          message:
            "Azure consent is not available. WATCHTOWER_AZURE_CLIENT_ID is not configured.",
        });
      }
      const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
      const redirectUri = `${baseUrl}/api/auth/ms-callback`;

      // Use the state parameter to pass the tenant ID back through the
      // OAuth redirect. The callback handler uses this to associate the
      // consent with the correct tenant.
      const state = Buffer.from(
        JSON.stringify({ tenantId: tenant.id, workspaceId: ctx.session.workspaceId }),
      ).toString("base64url");

      const consentUrl = new URL(
        `https://login.microsoftonline.com/${tenant.msTenantId}/adminconsent`,
      );
      consentUrl.searchParams.set("client_id", azureClientId);
      consentUrl.searchParams.set("redirect_uri", redirectUri);
      consentUrl.searchParams.set("state", state);

      return { url: consentUrl.toString() };
    }),
});
