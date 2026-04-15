/**
 * sandbox/registry-plugin.test.ts
 *
 * Unit tests for the registerPlugin() and related functions added to
 * the evaluator registry for customer plugin support.
 *
 * These tests verify:
 * - Plugin registration with sandboxed flag
 * - Plugin slug conflict detection
 * - Plugin unregistration (only sandboxed evaluators)
 * - isSandboxed() query
 * - sandboxedSlugs() listing
 * - Built-in evaluators cannot be unregistered
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getEvaluator,
  registerPlugin,
  unregisterPlugin,
  isSandboxed,
  sandboxedSlugs,
  registrySize,
  registeredSlugs,
} from "../../../packages/engine/evaluators/registry.ts";

// ── Test plugin evaluator wrapper ────────────────────────────────────────────

/** A mock plugin wrapper that always passes. */
const mockPassingPlugin = async () => ({
  pass: true as const,
  warnings: [] as string[],
});

/** A mock plugin wrapper that always fails. */
const mockFailingPlugin = async () => ({
  pass: false as const,
  warnings: ["Plugin check failed"],
});

// Track the initial registry size before any tests modify it
const INITIAL_REGISTRY_SIZE = registrySize();

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Plugin Registration", () => {
  // ── registerPlugin ─────────────────────────────────────────────────────

  describe("registerPlugin()", () => {
    it("registers a plugin evaluator", () => {
      registerPlugin("test-plugin-pass", mockPassingPlugin);

      const evaluator = getEvaluator("test-plugin-pass");
      expect(evaluator).toBeDefined();
      expect(evaluator).toBe(mockPassingPlugin);
    });

    it("marks the plugin as sandboxed", () => {
      registerPlugin("test-plugin-sandboxed", mockFailingPlugin);

      expect(isSandboxed("test-plugin-sandboxed")).toBe(true);
    });

    it("throws when plugin slug conflicts with built-in", () => {
      expect(() => {
        registerPlugin("dmarc-published", mockPassingPlugin);
      }).toThrow("conflicts with an existing evaluator");
    });

    it("throws when plugin slug conflicts with another plugin", () => {
      registerPlugin("test-plugin-dup", mockPassingPlugin);

      expect(() => {
        registerPlugin("test-plugin-dup", mockFailingPlugin);
      }).toThrow("conflicts with an existing evaluator");
    });

    it("throws when plugin slug conflicts with an alias", () => {
      expect(() => {
        registerPlugin("spfEnabled", mockPassingPlugin);
      }).toThrow("conflicts with an existing evaluator");
    });
  });

  // ── isSandboxed ────────────────────────────────────────────────────────

  describe("isSandboxed()", () => {
    it("returns false for built-in evaluators", () => {
      expect(isSandboxed("dmarc-published")).toBe(false);
    });

    it("returns false for aliases", () => {
      expect(isSandboxed("dmarcPublished")).toBe(false);
    });

    it("returns false for unknown slugs", () => {
      expect(isSandboxed("nonexistent-slug")).toBe(false);
    });

    it("returns true for registered plugins", () => {
      registerPlugin("test-plugin-is-sandboxed", mockPassingPlugin);
      expect(isSandboxed("test-plugin-is-sandboxed")).toBe(true);
    });
  });

  // ── unregisterPlugin ──────────────────────────────────────────────────

  describe("unregisterPlugin()", () => {
    it("removes a registered plugin", () => {
      registerPlugin("test-plugin-remove", mockPassingPlugin);
      expect(getEvaluator("test-plugin-remove")).toBeDefined();

      const removed = unregisterPlugin("test-plugin-remove");
      expect(removed).toBe(true);
      expect(getEvaluator("test-plugin-remove")).toBeUndefined();
    });

    it("returns false for built-in evaluators (cannot remove)", () => {
      const removed = unregisterPlugin("dmarc-published");
      expect(removed).toBe(false);
      // Built-in still exists
      expect(getEvaluator("dmarc-published")).toBeDefined();
    });

    it("returns false for unknown slugs", () => {
      const removed = unregisterPlugin("nonexistent-slug");
      expect(removed).toBe(false);
    });

    it("returns false for aliases (cannot remove)", () => {
      const removed = unregisterPlugin("dmarcPublished");
      expect(removed).toBe(false);
    });
  });

  // ── sandboxedSlugs ────────────────────────────────────────────────────

  describe("sandboxedSlugs()", () => {
    it("returns only sandboxed (plugin) slugs", () => {
      registerPlugin("test-plugin-listing", mockPassingPlugin);

      const slugs = sandboxedSlugs();
      expect(slugs).toContain("test-plugin-listing");

      // Should NOT contain any built-in slugs
      expect(slugs).not.toContain("dmarc-published");
      expect(slugs).not.toContain("spf-records-published");
    });

    it("does not include built-in evaluators", () => {
      const slugs = sandboxedSlugs();
      for (const slug of slugs) {
        expect(isSandboxed(slug)).toBe(true);
      }
    });
  });

  // ── Plugin evaluator execution ─────────────────────────────────────────

  describe("plugin evaluator execution", () => {
    it("plugin wrapper returns expected result when called", async () => {
      registerPlugin("test-plugin-exec", mockPassingPlugin);

      const evaluator = getEvaluator("test-plugin-exec");
      expect(evaluator).toBeDefined();

      const result = await evaluator!({ data: {} });
      expect(result.pass).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("failing plugin wrapper returns expected result", async () => {
      registerPlugin("test-plugin-exec-fail", mockFailingPlugin);

      const evaluator = getEvaluator("test-plugin-exec-fail");
      expect(evaluator).toBeDefined();

      const result = await evaluator!({ data: {} });
      expect(result.pass).toBe(false);
      expect(result.warnings).toContain("Plugin check failed");
    });
  });
});
