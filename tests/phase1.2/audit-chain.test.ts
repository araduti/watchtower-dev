// =============================================================================
// Phase 1.2 — Audit hash chain convention tests
// =============================================================================
// Validates the audit hash chain module follows Architecture.md §7.
// Source-level static analysis — no database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), "utf-8");
}

describe("Audit hash chain module (Architecture.md §7)", () => {
  const src = readFile("packages/db/src/audit.ts");

  describe("Ed25519 key management", () => {
    it("reads key from AUDIT_SIGNING_KEY_PATH", () => {
      expect(src).toContain("AUDIT_SIGNING_KEY_PATH");
    });

    it("parses PKCS#8 PEM format", () => {
      expect(src).toContain("pkcs8");
      expect(src).toContain("createPrivateKey");
    });

    it("validates the key is Ed25519", () => {
      expect(src).toContain("ed25519");
      expect(src).toContain("asymmetricKeyType");
    });

    it("caches the private key after first load", () => {
      expect(src).toContain("cachedPrivateKey");
    });

    it("derives public key from private key", () => {
      expect(src).toContain("createPublicKey");
    });

    it("stores only the public key in the database", () => {
      // The public key goes to AuditSigningKey; private key stays in memory
      expect(src).toContain("publicKey");
      expect(src).toContain("auditSigningKey");
    });

    it("validates key file readability before loading", () => {
      expect(src).toContain("accessSync");
      expect(src).toContain("R_OK");
    });
  });

  describe("signing key registration", () => {
    it("uses find-or-create pattern", () => {
      expect(src).toContain("findFirst");
      expect(src).toContain("create");
    });

    it("caches signing key ID in memory", () => {
      expect(src).toContain("cachedSigningKeyId");
    });

    it("uses raw prisma singleton (not RLS-scoped)", () => {
      // The signing key table is global, not workspace-scoped
      expect(src).toContain('import { prisma } from "./client.ts"');
    });
  });

  describe("hash chain construction", () => {
    it("uses SHA-256 for hashing", () => {
      expect(src).toContain("sha256");
      expect(src).toContain("createHash");
    });

    it("uses Ed25519 for signing", () => {
      expect(src).toContain("sign(null");
    });

    it("signs raw hash bytes (not hex text)", () => {
      expect(src).toContain('Buffer.from(hexHash, "hex")');
    });

    it("hashes prevHash concatenated with canonical payload", () => {
      expect(src).toContain("prevHash");
      expect(src).toContain("canonical");
    });

    it("sorts keys for canonical JSON", () => {
      expect(src).toContain("sort()");
    });
  });

  describe("chain sequence", () => {
    it("fetches previous event by chainSequence DESC", () => {
      expect(src).toContain("chainSequence");
      expect(src).toContain('"desc"');
    });

    it("uses genesis values for first event", () => {
      expect(src).toContain("GENESIS_PREV_HASH");
      expect(src).toContain("GENESIS_CHAIN_SEQUENCE");
    });

    it("genesis prevHash is 64 zeros", () => {
      expect(src).toContain('"0".repeat(64)');
    });

    it("increments chainSequence monotonically", () => {
      expect(src).toContain("chainSequence + 1");
    });
  });

  describe("createAuditEvent interface", () => {
    it("exports createAuditEvent function", () => {
      expect(src).toContain("export async function createAuditEvent");
    });

    it("exports AuditEventInput type", () => {
      expect(src).toContain("export interface AuditEventInput");
    });

    it("accepts PrismaTransactionClient as first parameter", () => {
      expect(src).toContain("PrismaTransactionClient");
    });

    it("includes all required business fields", () => {
      expect(src).toContain("workspaceId");
      expect(src).toContain("scopeId");
      expect(src).toContain("eventType");
      expect(src).toContain("actorType");
      expect(src).toContain("actorId");
      expect(src).toContain("targetType");
      expect(src).toContain("targetId");
      expect(src).toContain("eventData");
      expect(src).toContain("traceId");
    });

    it("returns { id: string }", () => {
      expect(src).toContain("Promise<{ id: string }>");
    });
  });

  describe("security invariants", () => {
    it("never stores private key in database", () => {
      // The create/findFirst calls should only reference publicKey
      // The private key should only appear as a local variable, never in a Prisma data: {} block
      expect(src).toContain("publicKey: publicKeyPem");
      // No data block should contain privateKey
      const dataBlocks = src.match(/data:\s*\{[^}]*\}/g) || [];
      for (const block of dataBlocks) {
        expect(block).not.toContain("privateKey");
      }
    });

    it("uses node:crypto (no external crypto libs)", () => {
      expect(src).toContain("node:crypto");
    });

    it("error messages use [watchtower/db] prefix", () => {
      expect(src).toContain("[watchtower/db]");
    });

    it("error messages do not leak file paths", () => {
      // Should say "path specified by AUDIT_SIGNING_KEY_PATH",
      // not the actual file path value
      const lines = src.split("\n");
      const errorLines = lines.filter((l) => l.includes("throw new Error"));
      for (const line of errorLines) {
        expect(line).not.toContain("keyPath");
      }
    });

    it("exports test reset utility", () => {
      expect(src).toContain("_resetSigningKeyCache");
    });
  });
});

describe("@watchtower/db exports audit module", () => {
  const indexSrc = readFile("packages/db/src/index.ts");

  it("exports createAuditEvent", () => {
    expect(indexSrc).toContain("createAuditEvent");
  });

  it("exports AuditEventInput type", () => {
    expect(indexSrc).toContain("AuditEventInput");
  });
});

describe("Workspace router uses createAuditEvent (not raw auditEvent.create)", () => {
  const src = readFile("apps/web/src/server/routers/workspace.ts");

  it("imports createAuditEvent from @watchtower/db", () => {
    expect(src).toContain('import { createAuditEvent } from "@watchtower/db"');
  });

  it("calls createAuditEvent (not ctx.db.auditEvent.create)", () => {
    expect(src).toContain("createAuditEvent(ctx.db,");
    expect(src).not.toContain("ctx.db.auditEvent.create");
  });

  it("no longer has placeholder hash chain values", () => {
    expect(src).not.toContain("prevHash:");
    expect(src).not.toContain("rowHash:");
    expect(src).not.toContain("chainSequence:");
    expect(src).not.toContain("signature:");
    expect(src).not.toContain('signingKeyId: "placeholder"');
  });

  it("no longer has Phase 1.1 limitation comments", () => {
    expect(src).not.toContain("Phase 1.1");
    expect(src).not.toContain("placeholder");
  });
});
