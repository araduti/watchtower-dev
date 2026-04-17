/**
 * @module @watchtower/db/audit
 *
 * Audit log hash chain construction for Watchtower.
 *
 * Each workspace maintains an independent, append-only hash chain of audit
 * events. Every event records:
 *
 * - `prevHash`      — the `rowHash` of the preceding event in that workspace
 * - `rowHash`       — SHA-256(prevHash || canonicalJSON(payload))
 * - `chainSequence` — gap-free, monotonically increasing counter per workspace
 * - `signature`     — Ed25519 signature of `rowHash` (hex-encoded)
 * - `signingKeyId`  — FK to `AuditSigningKey` holding the **public** key
 *
 * The Ed25519 private key is loaded from `AUDIT_SIGNING_KEY_PATH` (PKCS#8 PEM
 * produced by `openssl genpkey -algorithm Ed25519`). The private key NEVER
 * enters the database — only the derived public key is stored.
 *
 * Security invariants:
 * - Private key is lazy-loaded once, then cached in memory.
 * - Public key is upserted into `AuditSigningKey` via the raw prisma
 *   singleton (not RLS-scoped) because it is a global bootstrap table.
 * - All chain writes go through the caller-provided `tx` (RLS-scoped
 *   transaction client) so RLS policies continue to apply.
 */

import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { readFileSync, accessSync, constants as fsConstants } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "./client.ts";
import type { PrismaTransactionClient, Prisma } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Business fields for an audit event.
 *
 * Hash chain fields (`prevHash`, `rowHash`, `chainSequence`, `signature`,
 * `signingKeyId`) are computed internally — callers never provide them.
 */
export interface AuditEventInput {
  workspaceId: string;
  scopeId?: string | null;
  eventType: string;
  actorType: "USER" | "SYSTEM" | "API_TOKEN" | "PLUGIN";
  actorId: string;
  targetType: string;
  targetId: string;
  eventData: Record<string, unknown>;
  traceId?: string | null;
  occurredAt?: Date;
}

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

/**
 * Find the monorepo root by walking up from this file's directory until we
 * find a `package.json` containing a `"workspaces"` field. This is more
 * robust than counting `..` hops — it survives structural refactors as long
 * as the workspace root keeps its `package.json`.
 *
 * Relative paths in `AUDIT_SIGNING_KEY_PATH` are resolved against this root
 * so `./secrets/audit-signing-key.pem` always points to `<root>/secrets/...`
 * even when `process.cwd()` is `apps/web/` or `apps/worker/`.
 */
function findProjectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  const { root: fsRoot } = Object.freeze({ root: resolve(dir, "/") });

  while (dir !== fsRoot) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf-8"));
      if (pkg.workspaces) {
        return dir;
      }
    } catch {
      // No package.json here — keep walking up.
    }
    dir = dirname(dir);
  }

  // Fallback: if no workspace root found, use cwd (original behaviour).
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// ---------------------------------------------------------------------------
// Genesis constants
// ---------------------------------------------------------------------------

/** `prevHash` for the first event in a workspace chain. */
const GENESIS_PREV_HASH = "0".repeat(64);

/** `chainSequence` value that precedes the first real event. */
const GENESIS_CHAIN_SEQUENCE = 0;

// ---------------------------------------------------------------------------
// Signing key — lazy init, cached
// ---------------------------------------------------------------------------

let cachedPrivateKey: KeyObject | null = null;
let cachedPublicKeyPem: string | null = null;
let cachedSigningKeyId: string | null = null;

/**
 * Load the Ed25519 private key from `AUDIT_SIGNING_KEY_PATH`.
 *
 * Validates that the environment variable is set and the file exists
 * before attempting to parse. The key is cached after first load.
 *
 * @throws {Error} If the env var is missing, the file is unreadable,
 *                 or the PEM cannot be parsed as an Ed25519 key.
 */
function loadPrivateKey(): KeyObject {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  const rawKeyPath = process.env["AUDIT_SIGNING_KEY_PATH"];
  if (!rawKeyPath) {
    throw new Error(
      "[watchtower/db] AUDIT_SIGNING_KEY_PATH is not set. " +
        "The audit subsystem requires an Ed25519 private key (PKCS#8 PEM) " +
        "to sign hash chain entries.",
    );
  }

  // Resolve relative paths against the project root, not process.cwd().
  // This ensures `./secrets/audit-signing-key.pem` works regardless of
  // which sub-package (web, worker, tests) starts the process.
  const keyPath = isAbsolute(rawKeyPath)
    ? rawKeyPath
    : resolve(PROJECT_ROOT, rawKeyPath);

  // Validate the file is readable before attempting to load it.
  try {
    accessSync(keyPath, fsConstants.R_OK);
  } catch (cause) {
    throw new Error(
      `[watchtower/db] Signing key file is not readable at path specified ` +
        `by AUDIT_SIGNING_KEY_PATH. Verify the file exists and has correct permissions. ` +
        `(resolved to: ${keyPath})`,
      { cause },
    );
  }

  const pem = readFileSync(keyPath, "utf-8");

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: pem, format: "pem", type: "pkcs8" });
  } catch (cause) {
    throw new Error(
      "[watchtower/db] Failed to parse Ed25519 private key from " +
        "AUDIT_SIGNING_KEY_PATH. Expected a PKCS#8 PEM produced by " +
        "`openssl genpkey -algorithm Ed25519`.",
      { cause },
    );
  }

  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `[watchtower/db] Signing key is ${privateKey.asymmetricKeyType}, ` +
        "expected ed25519. Audit hash chains require an Ed25519 key.",
    );
  }

  cachedPrivateKey = privateKey;
  return privateKey;
}

/**
 * Derive the PEM-encoded public key from the loaded private key.
 * Cached after first derivation.
 */
function getPublicKeyPem(): string {
  if (cachedPublicKeyPem) {
    return cachedPublicKeyPem;
  }

  const privateKey = loadPrivateKey();
  const publicKey = createPublicKey(privateKey);
  const pem = publicKey.export({ type: "spki", format: "pem" }) as string;

  cachedPublicKeyPem = pem;
  return pem;
}

/**
 * Upsert the `AuditSigningKey` row using the raw `prisma` singleton.
 *
 * This is a global bootstrap query — the signing key table is not
 * workspace-scoped so it does not go through RLS. The upsert is
 * idempotent: if a row with the same public key already exists, the
 * existing ID is returned.
 *
 * @returns The `id` of the `AuditSigningKey` row.
 */
async function ensureSigningKeyRegistered(): Promise<string> {
  if (cachedSigningKeyId) {
    return cachedSigningKeyId;
  }

  const publicKeyPem = getPublicKeyPem();

  // Upsert by publicKey — if the key is already registered, reuse it.
  // Prisma upsert requires a unique field for the `where` clause.
  // AuditSigningKey has only `id` as unique, so we do a find-or-create.
  const existing = await prisma.auditSigningKey.findFirst({
    where: { publicKey: publicKeyPem, retiredAt: null },
    select: { id: true },
  });

  if (existing) {
    cachedSigningKeyId = existing.id;
    return existing.id;
  }

  const created = await prisma.auditSigningKey.create({
    data: {
      publicKey: publicKeyPem,
      algorithm: "ed25519",
    },
    select: { id: true },
  });

  cachedSigningKeyId = created.id;
  return created.id;
}

// ---------------------------------------------------------------------------
// Canonicalization & hashing
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic JSON representation of the audit event payload.
 *
 * Keys are sorted alphabetically at every nesting level to ensure
 * identical payloads produce identical hashes regardless of object
 * property insertion order.
 */
function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

/**
 * Compute `SHA-256(prevHash || canonicalJSON(payload))` → hex string.
 */
function computeRowHash(
  prevHash: string,
  payload: Record<string, unknown>,
): string {
  const canonical = canonicalJSON(payload);
  return createHash("sha256")
    .update(prevHash)
    .update(canonical)
    .digest("hex");
}

/**
 * Sign `data` with the loaded Ed25519 private key → hex string.
 *
 * The input `hexHash` is a hex-encoded SHA-256 digest. We convert it to
 * raw bytes before signing so the signature covers the actual hash value,
 * not its text encoding.
 *
 * Ed25519 does not use a separate digest algorithm — pass `null`
 * as the algorithm parameter.
 */
function signData(hexHash: string): string {
  const privateKey = loadPrivateKey();
  const signature = sign(null, Buffer.from(hexHash, "hex"), privateKey);
  return signature.toString("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an audit event with hash chain integrity and Ed25519 signature.
 *
 * **MUST be called inside a Prisma transaction** (via `tx` from `withRLS`).
 * The function:
 *
 * 1. Fetches the previous event in the workspace's chain (or uses genesis
 *    values for the first event).
 * 2. Computes the next `chainSequence` (gap-free, monotonic).
 * 3. Builds a canonical payload from the business fields.
 * 4. Hashes `SHA-256(prevHash || canonicalJSON(payload))` → `rowHash`.
 * 5. Signs `rowHash` with the Ed25519 private key → `signature`.
 * 6. Inserts the row via `tx.auditEvent.create()`.
 *
 * Concurrency safety: the `@@unique([workspaceId, chainSequence])` constraint
 * will cause a unique violation if two transactions race for the same
 * sequence number, causing one to retry.
 *
 * @param tx    - Prisma transaction client (from `withRLS` or `$transaction`)
 * @param input - Business fields for the audit event
 * @returns The created audit event `{ id }`.
 */
export async function createAuditEvent(
  tx: PrismaTransactionClient,
  input: AuditEventInput,
): Promise<{ id: string }> {
  // 1. Ensure the signing key is registered (lazy, cached).
  const signingKeyId = await ensureSigningKeyRegistered();

  // 2. Fetch the most recent event in this workspace's chain.
  const previous = await tx.auditEvent.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { chainSequence: "desc" },
    select: { prevHash: true, rowHash: true, chainSequence: true },
  });

  const prevHash = previous ? previous.rowHash : GENESIS_PREV_HASH;
  const chainSequence = previous
    ? previous.chainSequence + 1
    : GENESIS_CHAIN_SEQUENCE + 1;

  // 3. Resolve defaults.
  const occurredAt = input.occurredAt ?? new Date();

  // 4. Build the canonical payload for hashing.
  //    Only business fields go into the hash — chain-internal fields
  //    (`prevHash`, `signature`, `signingKeyId`, `recordedAt`) are excluded
  //    to avoid circular dependencies.
  const canonicalPayload: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    scopeId: input.scopeId ?? null,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    eventData: input.eventData,
    traceId: input.traceId ?? null,
    occurredAt: occurredAt.toISOString(),
    chainSequence,
  };

  // 5. Compute rowHash = SHA-256(prevHash || canonicalJSON(canonicalPayload)).
  const rowHash = computeRowHash(prevHash, canonicalPayload);

  // 6. Sign the rowHash with the Ed25519 private key.
  const signature = signData(rowHash);

  // 7. Persist the audit event.
  const created = await tx.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      scopeId: input.scopeId ?? null,
      eventType: input.eventType,
      actorType: input.actorType,
      actorId: input.actorId,
      targetType: input.targetType,
      targetId: input.targetId,
      eventData: input.eventData as Prisma.InputJsonValue,
      traceId: input.traceId ?? null,
      occurredAt,
      prevHash,
      rowHash,
      chainSequence,
      signature,
      signingKeyId,
    },
    select: { id: true },
  });

  return created;
}

// ---------------------------------------------------------------------------
// Test utilities — exported for unit test seams only
// ---------------------------------------------------------------------------

/**
 * Reset the cached signing key state. **Test-only** — never call in
 * production code.
 *
 * @internal
 */
export function _resetSigningKeyCache(): void {
  cachedPrivateKey = null;
  cachedPublicKeyPem = null;
  cachedSigningKeyId = null;
}
