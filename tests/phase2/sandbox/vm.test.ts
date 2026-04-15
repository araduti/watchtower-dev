/**
 * sandbox/vm.test.ts
 *
 * Unit tests for the Firecracker VM lifecycle manager.
 *
 * Since we cannot run actual Firecracker VMs in CI (no /dev/kvm),
 * these tests verify:
 * - EvaluatorResult schema validation
 * - EvidenceSnapshot schema validation
 * - Failure result construction
 * - Input validation (missing binaries, missing images)
 * - The spawnPluginVM function gracefully handles missing infrastructure
 */

import { describe, it, expect } from "vitest";
import {
  EvaluatorResultSchema,
  EvidenceSnapshotSchema,
  spawnPluginVM,
} from "../../../packages/sandbox/src/vm.ts";
import { DEFAULT_SANDBOX_CONFIG } from "../../../packages/sandbox/src/config.ts";

// ── EvaluatorResultSchema ────────────────────────────────────────────────────

describe("EvaluatorResultSchema", () => {
  describe("valid results", () => {
    it("accepts a passing result", () => {
      const result = EvaluatorResultSchema.safeParse({
        pass: true,
        warnings: [],
      });
      expect(result.success).toBe(true);
    });

    it("accepts a failing result with warnings", () => {
      const result = EvaluatorResultSchema.safeParse({
        pass: false,
        warnings: ["DMARC not configured", "SPF missing"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.warnings).toHaveLength(2);
      }
    });

    it("accepts a passing result with warnings", () => {
      const result = EvaluatorResultSchema.safeParse({
        pass: true,
        warnings: ["Non-critical observation"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid results", () => {
    it("rejects missing pass field", () => {
      const result = EvaluatorResultSchema.safeParse({
        warnings: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing warnings field", () => {
      const result = EvaluatorResultSchema.safeParse({
        pass: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-boolean pass", () => {
      const result = EvaluatorResultSchema.safeParse({
        pass: "true",
        warnings: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-array warnings", () => {
      const result = EvaluatorResultSchema.safeParse({
        pass: true,
        warnings: "not an array",
      });
      expect(result.success).toBe(false);
    });

    it("rejects warnings with non-string elements", () => {
      const result = EvaluatorResultSchema.safeParse({
        pass: true,
        warnings: [123, true],
      });
      expect(result.success).toBe(false);
    });

    it("rejects null", () => {
      const result = EvaluatorResultSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("rejects undefined", () => {
      const result = EvaluatorResultSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });
  });
});

// ── EvidenceSnapshotSchema ───────────────────────────────────────────────────

describe("EvidenceSnapshotSchema", () => {
  it("accepts an empty object", () => {
    const result = EvidenceSnapshotSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a snapshot with data", () => {
    const result = EvidenceSnapshotSchema.safeParse({
      data: {
        conditionalAccessPolicies: [{ id: "1", displayName: "Test" }],
        domains: ["example.com"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a snapshot with empty data", () => {
    const result = EvidenceSnapshotSchema.safeParse({
      data: {},
    });
    expect(result.success).toBe(true);
  });
});

// ── spawnPluginVM — missing infrastructure ───────────────────────────────────

describe("spawnPluginVM — missing infrastructure", () => {
  it("returns failure when Firecracker binary is missing", async () => {
    const result = await spawnPluginVM(
      "export function evaluate() { return { pass: true, warnings: [] }; }",
      { data: {} },
      {
        ...DEFAULT_SANDBOX_CONFIG,
        firecrackerBinPath: "/nonexistent/firecracker",
      },
    );

    expect(result.pass).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Sandbox initialization failed");
    expect(result.warnings[0]).toContain("Firecracker binary not found");
  });

  it("returns failure when kernel image is missing", async () => {
    // Create a fake firecracker binary to pass the first check
    const { writeFileSync, unlinkSync, chmodSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const fakeBin = join(tmpdir(), "fake-firecracker-test");
    writeFileSync(fakeBin, "#!/bin/sh\nexit 1\n");
    chmodSync(fakeBin, 0o755);

    try {
      const result = await spawnPluginVM(
        "export function evaluate() { return { pass: true, warnings: [] }; }",
        { data: {} },
        {
          ...DEFAULT_SANDBOX_CONFIG,
          firecrackerBinPath: fakeBin,
          kernelImagePath: "/nonexistent/vmlinux",
        },
      );

      expect(result.pass).toBe(false);
      expect(result.warnings[0]).toContain("kernel image not found");
    } finally {
      unlinkSync(fakeBin);
    }
  });

  it("returns failure when rootfs image is missing", async () => {
    const { writeFileSync, unlinkSync, chmodSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const fakeBin = join(tmpdir(), "fake-firecracker-test2");
    const fakeKernel = join(tmpdir(), "fake-vmlinux-test");
    writeFileSync(fakeBin, "#!/bin/sh\nexit 1\n");
    chmodSync(fakeBin, 0o755);
    writeFileSync(fakeKernel, "fake-kernel");

    try {
      const result = await spawnPluginVM(
        "export function evaluate() { return { pass: true, warnings: [] }; }",
        { data: {} },
        {
          ...DEFAULT_SANDBOX_CONFIG,
          firecrackerBinPath: fakeBin,
          kernelImagePath: fakeKernel,
          rootfsImagePath: "/nonexistent/rootfs.ext4",
        },
      );

      expect(result.pass).toBe(false);
      expect(result.warnings[0]).toContain("rootfs image not found");
    } finally {
      unlinkSync(fakeBin);
      unlinkSync(fakeKernel);
    }
  });
});
