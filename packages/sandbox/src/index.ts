/**
 * @watchtower/sandbox — Public API.
 *
 * The sandbox package provides the Firecracker microVM lifecycle manager
 * for executing customer-authored plugin evaluators in hardware-isolated
 * guest kernels.
 *
 * Primary exports:
 * - `spawnPluginVM()` — Execute a plugin inside a Firecracker microVM
 * - `executePluginDevMode()` — Dev-mode fallback (no sandbox, no KVM)
 * - `isKvmAvailable()` — Check if the host supports KVM
 * - `SandboxConfig` / `DEFAULT_SANDBOX_CONFIG` — Configuration types
 * - `PluginMetadataSchema` / `PluginSourceSchema` — Plugin validation
 * - `EvaluatorResultSchema` — Result validation shared with the engine
 *
 * @see docs/decisions/004-single-engine-firecracker-sandbox.md
 */

export {
  spawnPluginVM,
  EvaluatorResultSchema,
  EvidenceSnapshotSchema,
} from "./vm.ts";
export type { EvaluatorResult, EvidenceSnapshot } from "./vm.ts";

export {
  type SandboxConfig,
  DEFAULT_SANDBOX_CONFIG,
} from "./config.ts";

export {
  PluginMetadataSchema,
  PluginSourceSchema,
} from "./plugin-schema.ts";
export type { PluginMetadata, PluginSource } from "./plugin-schema.ts";

export {
  executePluginDevMode,
  isKvmAvailable,
} from "./dev-mode.ts";
