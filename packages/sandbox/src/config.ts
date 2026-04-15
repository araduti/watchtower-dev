/**
 * @watchtower/sandbox — Configuration types for the Firecracker microVM sandbox.
 *
 * These types define the sandbox boundary: resource limits, paths to
 * Firecracker artifacts, and timeout settings. The configuration is
 * validated at startup and immutable at runtime.
 */

/**
 * Configuration for the Firecracker microVM sandbox.
 *
 * All paths are resolved at worker startup and validated for existence.
 * The sandbox refuses to start if any required artifact is missing.
 */
export interface SandboxConfig {
  /**
   * Path to the Firecracker binary.
   * Must be executable by the worker process.
   */
  readonly firecrackerBinPath: string;

  /**
   * Path to the minimal Linux kernel image (vmlinux).
   * Loaded by Firecracker as the guest kernel.
   */
  readonly kernelImagePath: string;

  /**
   * Path to the rootfs ext4 image.
   * Contains Alpine + Bun runtime. Mounted read-only by the guest.
   * Never modified by plugins — the same image is reused across all VMs.
   */
  readonly rootfsImagePath: string;

  /**
   * Maximum execution time for a single plugin evaluation, in seconds.
   * The VM is hard-killed after this duration.
   * Default: 30 seconds.
   */
  readonly timeoutSeconds: number;

  /**
   * Memory limit for the guest VM, in MiB.
   * Default: 128 MiB.
   */
  readonly memoryMiB: number;

  /**
   * Number of vCPUs allocated to the guest VM.
   * Default: 1.
   */
  readonly vcpuCount: number;
}

/**
 * Default sandbox configuration values.
 * Paths are placeholders — they must be overridden with real paths at startup.
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  firecrackerBinPath: "/usr/local/bin/firecracker",
  kernelImagePath: "/opt/watchtower/vmlinux",
  rootfsImagePath: "/opt/watchtower/rootfs.ext4",
  timeoutSeconds: 30,
  memoryMiB: 128,
  vcpuCount: 1,
};
