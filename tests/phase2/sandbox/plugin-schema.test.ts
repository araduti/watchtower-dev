/**
 * sandbox/plugin-schema.test.ts
 *
 * Unit tests for the plugin file format Zod validation schemas.
 * These schemas validate customer-authored plugin metadata and source
 * before they reach the Firecracker sandbox.
 */

import { describe, it, expect } from "vitest";
import {
  PluginMetadataSchema,
  PluginSourceSchema,
} from "../../../packages/sandbox/src/plugin-schema.ts";

// ── PluginMetadataSchema ─────────────────────────────────────────────────────

describe("PluginMetadataSchema", () => {
  describe("valid metadata", () => {
    it("accepts minimal metadata with slug only", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "my-custom-check",
      });
      expect(result.success).toBe(true);
    });

    it("accepts full metadata with all optional fields", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "custom-dns-check",
        name: "Custom DNS Verification",
        description: "Checks that DNS records are properly configured",
        version: "1.0.0",
        requiredSources: ["dnsRecords", "domains"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts a slug with numbers", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "check-v2-enhanced",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a single-word slug", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "check",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid slugs", () => {
    it("rejects empty slug", () => {
      const result = PluginMetadataSchema.safeParse({ slug: "" });
      expect(result.success).toBe(false);
    });

    it("rejects slug starting with a number", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "123-check",
      });
      expect(result.success).toBe(false);
    });

    it("rejects slug with uppercase letters", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "MyCheck",
      });
      expect(result.success).toBe(false);
    });

    it("rejects slug with underscores", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "my_check",
      });
      expect(result.success).toBe(false);
    });

    it("rejects slug with spaces", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "my check",
      });
      expect(result.success).toBe(false);
    });

    it("rejects slug starting with a hyphen", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "-check",
      });
      expect(result.success).toBe(false);
    });

    it("rejects slug exceeding 128 characters", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "a" + "-check".repeat(30),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("invalid versions", () => {
    it("rejects non-semver version", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "check",
        version: "v1.0",
      });
      expect(result.success).toBe(false);
    });

    it("rejects version with pre-release suffix", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "check",
        version: "1.0.0-beta",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("description limits", () => {
    it("rejects description exceeding 1024 characters", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "check",
        description: "x".repeat(1025),
      });
      expect(result.success).toBe(false);
    });

    it("accepts description at exactly 1024 characters", () => {
      const result = PluginMetadataSchema.safeParse({
        slug: "check",
        description: "x".repeat(1024),
      });
      expect(result.success).toBe(true);
    });
  });
});

// ── PluginSourceSchema ───────────────────────────────────────────────────────

describe("PluginSourceSchema", () => {
  it("accepts valid plugin source", () => {
    const source = `
      export function evaluate(snapshot) {
        return { pass: true, warnings: [] };
      }
    `;
    const result = PluginSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("rejects source shorter than 10 characters", () => {
    const result = PluginSourceSchema.safeParse("short");
    expect(result.success).toBe(false);
  });

  it("rejects empty source", () => {
    const result = PluginSourceSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects source exceeding 1MB", () => {
    const result = PluginSourceSchema.safeParse("x".repeat(1_000_001));
    expect(result.success).toBe(false);
  });

  it("accepts source at exactly 1MB", () => {
    const result = PluginSourceSchema.safeParse("x".repeat(1_000_000));
    expect(result.success).toBe(true);
  });
});
