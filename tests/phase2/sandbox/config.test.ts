/**
 * sandbox/config.test.ts
 *
 * Unit tests for sandbox configuration types and defaults.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_SANDBOX_CONFIG,
  type SandboxConfig,
} from "../../../packages/sandbox/src/config.ts";

describe("SandboxConfig", () => {
  describe("DEFAULT_SANDBOX_CONFIG", () => {
    it("has all required fields", () => {
      expect(DEFAULT_SANDBOX_CONFIG.firecrackerBinPath).toBe(
        "/usr/local/bin/firecracker",
      );
      expect(DEFAULT_SANDBOX_CONFIG.kernelImagePath).toBe(
        "/opt/watchtower/vmlinux",
      );
      expect(DEFAULT_SANDBOX_CONFIG.rootfsImagePath).toBe(
        "/opt/watchtower/rootfs.ext4",
      );
      expect(DEFAULT_SANDBOX_CONFIG.timeoutSeconds).toBe(30);
      expect(DEFAULT_SANDBOX_CONFIG.memoryMiB).toBe(128);
      expect(DEFAULT_SANDBOX_CONFIG.vcpuCount).toBe(1);
    });

    it("has reasonable timeout default (30 seconds)", () => {
      expect(DEFAULT_SANDBOX_CONFIG.timeoutSeconds).toBeGreaterThanOrEqual(10);
      expect(DEFAULT_SANDBOX_CONFIG.timeoutSeconds).toBeLessThanOrEqual(120);
    });

    it("has reasonable memory default (128 MiB)", () => {
      expect(DEFAULT_SANDBOX_CONFIG.memoryMiB).toBeGreaterThanOrEqual(64);
      expect(DEFAULT_SANDBOX_CONFIG.memoryMiB).toBeLessThanOrEqual(512);
    });

    it("has reasonable vCPU default (1)", () => {
      expect(DEFAULT_SANDBOX_CONFIG.vcpuCount).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_SANDBOX_CONFIG.vcpuCount).toBeLessThanOrEqual(4);
    });

    it("is readonly (all properties)", () => {
      // TypeScript readonly enforcement — this test documents the constraint.
      // At runtime, we verify the object structure is complete.
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG };
      expect(Object.keys(config)).toHaveLength(6);
    });
  });

  describe("custom configuration", () => {
    it("can override individual values", () => {
      const custom: SandboxConfig = {
        ...DEFAULT_SANDBOX_CONFIG,
        timeoutSeconds: 60,
        memoryMiB: 256,
      };
      expect(custom.timeoutSeconds).toBe(60);
      expect(custom.memoryMiB).toBe(256);
      // Unchanged fields retain defaults
      expect(custom.vcpuCount).toBe(1);
    });
  });
});
