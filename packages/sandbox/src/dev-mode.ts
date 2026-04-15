/**
 * @watchtower/sandbox — Dev-mode fallback for non-KVM environments.
 *
 * Firecracker requires KVM, which is only available on Linux bare metal
 * (or nested-virt-enabled VMs). Contributors on macOS cannot run
 * Firecracker locally.
 *
 * This module provides a same-process fallback that executes plugin
 * evaluators without sandbox isolation. It is ONLY used in development
 * and emits a loud warning on every invocation.
 *
 * THIS IS NOT A SECURITY BOUNDARY. Plugins executed via dev-mode have
 * full access to the host process. The dev-mode fallback exists solely
 * to unblock local development on non-Linux machines.
 *
 * In production, the worker MUST have /dev/kvm access and the real
 * Firecracker sandbox MUST be used. The worker refuses to start in
 * production without KVM.
 */

import { EvaluatorResultSchema } from "./vm.ts";
import type { EvidenceSnapshot } from "./vm.ts";
import type { EvaluatorResult } from "./vm.ts";

const DEV_MODE_WARNING =
  "⚠️  SANDBOX DEV-MODE: Plugin is executing WITHOUT isolation. " +
  "This is acceptable in development but MUST NOT happen in production. " +
  "Ensure /dev/kvm is available and WATCHTOWER_SANDBOX_MODE is not 'dev'.";

/**
 * Execute a plugin evaluator in dev-mode (no sandbox).
 *
 * The plugin source is dynamically evaluated in the host process.
 * No isolation, no resource limits, no timeout enforcement beyond
 * a simple Promise.race with setTimeout.
 *
 * @param pluginSource - The plugin TypeScript source code
 * @param evidence     - The evidence snapshot
 * @param timeoutMs    - Timeout in milliseconds (default: 30000)
 * @returns EvaluatorResult from the plugin, or a failure result
 */
export async function executePluginDevMode(
  pluginSource: string,
  evidence: EvidenceSnapshot,
  timeoutMs: number = 30_000,
): Promise<EvaluatorResult> {
  console.warn(DEV_MODE_WARNING);

  try {
    // In dev mode, we create a temporary module and import it.
    // This is NOT sandboxed — the plugin has full access to the process.
    const { writeFileSync, unlinkSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const devDir = mkdtempSync(join(tmpdir(), "watchtower-dev-plugin-"));
    const pluginPath = join(devDir, "plugin.ts");

    writeFileSync(pluginPath, pluginSource, "utf-8");

    // Race the plugin execution against a timeout
    const timeoutPromise = new Promise<EvaluatorResult>((resolve) => {
      setTimeout(() => {
        resolve({
          pass: false,
          warnings: [`Plugin execution timed out after ${timeoutMs / 1000}s (dev-mode)`],
        });
      }, timeoutMs);
    });

    const executionPromise = (async (): Promise<EvaluatorResult> => {
      try {
        const mod = await import(pluginPath);
        const evaluate = mod.default?.evaluate ?? mod.evaluate;

        if (typeof evaluate !== "function") {
          return {
            pass: false,
            warnings: [
              "Plugin does not export an evaluate function (expected default export with evaluate or named evaluate export)",
            ],
          };
        }

        const rawResult = evaluate(evidence);
        const parseResult = EvaluatorResultSchema.safeParse(rawResult);

        if (!parseResult.success) {
          return {
            pass: false,
            warnings: ["Plugin returned invalid output (dev-mode)"],
          };
        }

        return parseResult.data;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          pass: false,
          warnings: [`Plugin crashed (dev-mode): ${message}`],
        };
      } finally {
        // Clean up
        try {
          unlinkSync(pluginPath);
          const { rmdirSync } = await import("node:fs");
          rmdirSync(devDir);
        } catch {
          // Best-effort cleanup
        }
      }
    })();

    return await Promise.race([executionPromise, timeoutPromise]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return {
      pass: false,
      warnings: [`Dev-mode sandbox initialization failed: ${message}`],
    };
  }
}

/**
 * Check whether KVM is available on the current system.
 *
 * Returns true if /dev/kvm exists and is accessible, indicating
 * that Firecracker can run. Returns false on macOS or Linux systems
 * without KVM support.
 */
export function isKvmAvailable(): boolean {
  try {
    const { accessSync, constants } = require("node:fs");
    accessSync("/dev/kvm", constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
