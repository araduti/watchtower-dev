/**
 * @watchtower/sandbox — Firecracker microVM lifecycle manager.
 *
 * Manages the full lifecycle of a sandboxed plugin evaluation:
 *   1. Spawn a Firecracker microVM with the plugin source and evidence
 *   2. Read the result from guest stdout
 *   3. Validate the result against the EvaluatorResult schema
 *   4. Kill the VM and clean up resources
 *
 * The VM is configured with:
 *   - No network (no virtio-net device attached)
 *   - Read-only rootfs (Alpine + Bun)
 *   - Plugin source injected via kernel boot args or tmpfs
 *   - Evidence snapshot passed via stdin to the guest process
 *   - Hard timeout enforced by the host
 *
 * This module is the security boundary between trusted platform code
 * and untrusted customer-authored plugin code. The only data that
 * crosses the boundary:
 *   - IN:  plugin TypeScript source (Zod-validated) + EvidenceSnapshot JSON
 *   - OUT: EvaluatorResult JSON on stdout
 *
 * @see docs/decisions/004-single-engine-firecracker-sandbox.md
 */

import { z } from "zod/v4";
import type { SandboxConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating EvaluatorResult returned by plugin VMs.
 *
 * Strict parsing: no extra fields allowed, `pass` must be boolean,
 * `warnings` must be an array of strings. Any deviation from this
 * schema is treated as a plugin failure.
 */
export const EvaluatorResultSchema = z.object({
  pass: z.boolean(),
  warnings: z.array(z.string()),
});

export type EvaluatorResult = z.infer<typeof EvaluatorResultSchema>;

/**
 * Zod schema for the evidence snapshot passed to plugin VMs.
 *
 * The `data` field is a record of evidence source keys to their values.
 * The schema is intentionally permissive on the values — the plugin
 * decides what shape it expects. The platform only validates the envelope.
 */
export const EvidenceSnapshotSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
});

export type EvidenceSnapshot = z.infer<typeof EvidenceSnapshotSchema>;

// ---------------------------------------------------------------------------
// Failure result helpers
// ---------------------------------------------------------------------------

/**
 * Construct a failure EvaluatorResult with a descriptive warning.
 * Used for all sandbox error conditions (timeout, crash, invalid output).
 */
function failureResult(warning: string): EvaluatorResult {
  return { pass: false, warnings: [warning] };
}

// ---------------------------------------------------------------------------
// VM lifecycle
// ---------------------------------------------------------------------------

/**
 * Spawn a Firecracker microVM to evaluate a customer plugin.
 *
 * This is the primary entry point for sandboxed plugin execution.
 * The function is async because it manages an external process lifecycle.
 *
 * @param pluginSource - The customer's TypeScript evaluator source code
 * @param evidence     - The evidence snapshot for the current tenant's scan
 * @param config       - Sandbox configuration (paths, limits, timeout)
 * @returns EvaluatorResult from the plugin, or a failure result on error
 *
 * Security invariants:
 * - The plugin source has already been Zod-validated before reaching here
 * - The evidence contains only the current tenant's data (no cross-tenant)
 * - The VM has no network (no virtio-net device)
 * - The VM has no host filesystem access (read-only rootfs only)
 * - The VM is hard-killed after `config.timeoutSeconds`
 * - stdout output is validated against EvaluatorResultSchema
 */
export async function spawnPluginVM(
  pluginSource: string,
  evidence: EvidenceSnapshot,
  config: SandboxConfig,
): Promise<EvaluatorResult> {
  // Validate the Firecracker binary and artifacts exist before attempting spawn
  const { existsSync } = await import("node:fs");

  if (!existsSync(config.firecrackerBinPath)) {
    return failureResult(
      `Sandbox initialization failed: Firecracker binary not found at ${config.firecrackerBinPath}`,
    );
  }

  if (!existsSync(config.kernelImagePath)) {
    return failureResult(
      `Sandbox initialization failed: kernel image not found at ${config.kernelImagePath}`,
    );
  }

  if (!existsSync(config.rootfsImagePath)) {
    return failureResult(
      `Sandbox initialization failed: rootfs image not found at ${config.rootfsImagePath}`,
    );
  }

  // Serialize the evidence snapshot for passing to the guest
  const evidenceJson = JSON.stringify(evidence);

  try {
    // Spawn the Firecracker process.
    //
    // The VM configuration is passed via a JSON config file that specifies:
    // - boot-source: kernel image path + boot args
    // - drives: rootfs image (read-only) + plugin overlay
    // - machine-config: vcpu count + memory
    // - NO network-interfaces (no virtio-net device = no network)
    //
    // The guest init process:
    //   1. Reads the plugin source from the overlay mount
    //   2. Reads the evidence JSON from stdin
    //   3. Dynamically imports and executes the plugin
    //   4. Writes the EvaluatorResult JSON to stdout
    //   5. Exits
    //
    // Implementation note: The actual Firecracker API interaction uses
    // either the Firecracker REST API (via Unix socket) or the jailer
    // wrapper. The full implementation requires:
    //   - Creating a temporary socket path for this VM instance
    //   - Writing a VM config JSON with the above settings
    //   - Starting the firecracker process
    //   - Sending the PUT /boot-source, PUT /drives, PUT /machine-config
    //   - Sending the PUT /actions (InstanceStart)
    //   - Reading stdout via the serial console or vsock
    //   - Enforcing timeout via setTimeout + process.kill()
    //
    // For now, this function validates inputs and returns a structured
    // error until the Firecracker binary and rootfs image are built.

    const { spawn } = await import("node:child_process");
    const { randomUUID } = await import("node:crypto");
    const { writeFileSync, unlinkSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    // Create a temporary directory for this VM instance
    const vmDir = mkdtempSync(join(tmpdir(), "watchtower-vm-"));
    const socketPath = join(vmDir, "firecracker.sock");
    const pluginPath = join(vmDir, "plugin.ts");
    const evidencePath = join(vmDir, "evidence.json");
    const vmConfigPath = join(vmDir, "vm-config.json");

    // Write plugin source and evidence to temp files
    writeFileSync(pluginPath, pluginSource, "utf-8");
    writeFileSync(evidencePath, evidenceJson, "utf-8");

    // Build the Firecracker VM configuration
    const vmConfig = {
      "boot-source": {
        kernel_image_path: config.kernelImagePath,
        boot_args:
          "console=ttyS0 reboot=k panic=1 pci=off init=/sbin/init",
      },
      drives: [
        {
          drive_id: "rootfs",
          path_on_host: config.rootfsImagePath,
          is_root_device: true,
          is_read_only: true,
        },
      ],
      "machine-config": {
        vcpu_count: config.vcpuCount,
        mem_size_mib: config.memoryMiB,
      },
      // Explicitly: NO network-interfaces key = no network in guest
    };

    writeFileSync(vmConfigPath, JSON.stringify(vmConfig), "utf-8");

    // Spawn the Firecracker process
    const firecrackerProcess = spawn(
      config.firecrackerBinPath,
      ["--api-sock", socketPath, "--config-file", vmConfigPath],
      {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: config.timeoutSeconds * 1000,
      },
    );

    // Pass evidence via stdin
    firecrackerProcess.stdin?.write(evidenceJson);
    firecrackerProcess.stdin?.end();

    // Collect stdout and stderr
    let stdout = "";
    let stderr = "";

    const result = await new Promise<EvaluatorResult>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        firecrackerProcess.kill("SIGKILL");
        resolve(
          failureResult(
            `Plugin execution timed out after ${config.timeoutSeconds}s`,
          ),
        );
      }, config.timeoutSeconds * 1000);

      firecrackerProcess.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      firecrackerProcess.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      firecrackerProcess.on("close", (code: number | null) => {
        clearTimeout(timeoutHandle);

        if (code !== 0) {
          // Sanitize stderr — never expose full stack traces
          const safeStderr =
            stderr.length > 200
              ? `${stderr.slice(0, 200)}…`
              : stderr || "(no output)";
          resolve(failureResult(`Plugin crashed (exit code ${code}): ${safeStderr}`));
          return;
        }

        // Parse and validate the result
        const parseResult = EvaluatorResultSchema.safeParse(
          (() => {
            try {
              return JSON.parse(stdout);
            } catch {
              return null;
            }
          })(),
        );

        if (!parseResult.success) {
          resolve(failureResult("Plugin returned invalid output"));
          return;
        }

        resolve(parseResult.data);
      });

      firecrackerProcess.on("error", (err: Error) => {
        clearTimeout(timeoutHandle);
        resolve(
          failureResult(`Sandbox initialization failed: ${err.message}`),
        );
      });
    });

    // Clean up temporary files
    try {
      unlinkSync(pluginPath);
      unlinkSync(evidencePath);
      unlinkSync(vmConfigPath);
      if (existsSync(socketPath)) unlinkSync(socketPath);
      const { rmdirSync } = await import("node:fs");
      rmdirSync(vmDir);
    } catch {
      // Best-effort cleanup — tmpdir will eventually be purged by the OS
    }

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return failureResult(`Sandbox initialization failed: ${message}`);
  }
}
