/**
 * @module server/idempotency
 *
 * Idempotency key management for tRPC mutations.
 *
 * Every Watchtower mutation requires a client-generated UUID v4 idempotency key
 * (API-Conventions.md §3). This module provides the check/store cycle:
 *
 *   1. `computeRequestHash` — deterministic SHA-256 of the mutation input
 *      (excluding the idempotencyKey itself).
 *   2. `checkIdempotencyKey` — look up a previous result by (workspaceId, key).
 *      Returns the cached response if found, or null for first-time requests.
 *      Throws DUPLICATE_IDEMPOTENCY_KEY if the same key is reused with a
 *      different request body.
 *   3. `saveIdempotencyResult` — persist the response for future lookups.
 *      Only caches 2xx and 4xx results. 5xx responses are never cached so
 *      clients may safely retry.
 */

import { createHash } from "node:crypto";

import type { PrismaTransactionClient, Prisma } from "@watchtower/db";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

import { throwWatchtowerError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Request hashing
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hex digest of the mutation input, excluding the
 * `idempotencyKey` field. Keys are sorted recursively so the hash is
 * deterministic regardless of property insertion order.
 *
 * @param input - The raw mutation input object.
 * @returns A 64-character lowercase hex SHA-256 digest.
 */
export function computeRequestHash(input: Record<string, unknown>): string {
  const { idempotencyKey: _omitted, ...rest } = input;
  const canonical = JSON.stringify(sortKeysDeep(rest));
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Recursively sort object keys so that `JSON.stringify` produces a
 * deterministic string regardless of insertion order.
 */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (typeof value === "object" && !(value instanceof Date)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep(
        (value as Record<string, unknown>)[key],
      );
    }
    return sorted;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

/**
 * Check whether a mutation has already been processed with this idempotency key.
 *
 * Look-up uses the `(workspaceId, key)` unique composite index.
 *
 * | Found? | Hash match? | Behaviour                                       |
 * |--------|-------------|-------------------------------------------------|
 * | No     | —           | Return `null` — proceed with the mutation.       |
 * | Yes    | Yes         | Return cached `{ responseBody, statusCode }`.    |
 * | Yes    | No          | Throw `DUPLICATE_IDEMPOTENCY_KEY` (CONFLICT).    |
 *
 * @param db             - The RLS-scoped Prisma transaction client.
 * @param workspaceId    - Current workspace (scopes the key).
 * @param idempotencyKey - Client-provided UUID v4.
 * @param requestHash    - SHA-256 of canonicalized input (without idempotencyKey).
 * @returns The cached response if found and valid, or `null` for a new request.
 */
export async function checkIdempotencyKey(
  db: PrismaTransactionClient,
  workspaceId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<{ responseBody: unknown; statusCode: number } | null> {
  const existing = await db.idempotencyKey.findUnique({
    where: {
      workspaceId_key: { workspaceId, key: idempotencyKey },
    },
    select: {
      requestHash: true,
      responseBody: true,
      statusCode: true,
    },
  });

  if (!existing) {
    return null;
  }

  // Same key, different payload — this is a misuse of the idempotency key.
  if (existing.requestHash !== requestHash) {
    throwWatchtowerError(WATCHTOWER_ERRORS.REQUEST.DUPLICATE_IDEMPOTENCY_KEY, {
      message:
        "Idempotency key has already been used for a different request body.",
    });
  }

  return {
    responseBody: existing.responseBody,
    statusCode: existing.statusCode,
  };
}

// ---------------------------------------------------------------------------
// Idempotency save
// ---------------------------------------------------------------------------

/**
 * Store the result of a mutation for future idempotency lookups.
 *
 * Only caches responses with `statusCode < 500`. Server errors (5xx) are
 * transient — the client should be able to retry with the same key.
 *
 * Uses `upsert` keyed on the unique `(workspaceId, key)` index to stay
 * idempotent even if two concurrent requests slip past the check.
 *
 * @param db             - The RLS-scoped Prisma transaction client.
 * @param workspaceId    - Current workspace.
 * @param idempotencyKey - Client-provided UUID v4.
 * @param requestHash    - SHA-256 of canonicalized input.
 * @param responseBody   - The response to cache.
 * @param statusCode     - HTTP-equivalent status (200 for success, 400/409 for
 *                         client errors).
 */
export async function saveIdempotencyResult(
  db: PrismaTransactionClient,
  workspaceId: string,
  idempotencyKey: string,
  requestHash: string,
  responseBody: unknown,
  statusCode: number,
): Promise<void> {
  // Never cache 5xx — allow the client to retry with the same key.
  if (statusCode >= 500) {
    return;
  }

  await db.idempotencyKey.upsert({
    where: {
      workspaceId_key: { workspaceId, key: idempotencyKey },
    },
    create: {
      workspaceId,
      key: idempotencyKey,
      requestHash,
      responseBody: responseBody as Prisma.InputJsonValue,
      statusCode,
    },
    // Prisma requires `update` even when no fields should change.
    // This is a deliberate no-op: if the row already exists (race condition
    // between two concurrent requests with the same key), the first write
    // wins and subsequent upserts leave the row untouched.
    update: {},
  });
}
