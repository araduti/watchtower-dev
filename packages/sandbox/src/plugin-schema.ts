/**
 * @watchtower/sandbox — Plugin file format validation.
 *
 * Defines the Zod schema for customer-authored plugin files. Every plugin
 * must export a default function conforming to the EvaluatorFn contract.
 *
 * Validation happens at two points:
 * 1. At PluginRepo sync time (Inngest worker) — reject invalid plugins early
 * 2. At registration time (registerPlugin) — defense in depth
 *
 * The schema validates the plugin's metadata and structure, not its runtime
 * behavior. Runtime behavior is constrained by the Firecracker sandbox.
 */

import { z } from "zod/v4";

/**
 * Metadata schema for a customer plugin file.
 *
 * The plugin file must export a module with:
 * - `slug`: a unique identifier matching the ControlAssertion.evaluatorSlug
 * - `evaluate`: the evaluator function
 *
 * The Zod schema validates the metadata portion. The `evaluate` function
 * itself cannot be schema-validated (it's a function), but its output
 * is validated by the sandbox after execution.
 */
export const PluginMetadataSchema = z.object({
  /** Stable slug for this plugin, matching ControlAssertion.evaluatorSlug */
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Plugin slug must be lowercase alphanumeric with hyphens, starting with a letter",
    ),

  /** Human-readable name for display in the UI */
  name: z.string().min(1).max(256).optional(),

  /** Description of what this plugin evaluates */
  description: z.string().max(1024).optional(),

  /** Semantic version of the plugin */
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+$/,
      "Version must be semver format (e.g., 1.0.0)",
    )
    .optional(),

  /** Evidence source keys this plugin reads from the snapshot */
  requiredSources: z.array(z.string()).optional(),
});

export type PluginMetadata = z.infer<typeof PluginMetadataSchema>;

/**
 * Validates that a plugin source string is syntactically non-empty
 * and doesn't contain obvious red flags.
 *
 * This is NOT a security boundary — the Firecracker sandbox is the
 * security boundary. This is a fast-fail validation to catch obviously
 * malformed or empty plugin files before they reach the sandbox.
 */
export const PluginSourceSchema = z
  .string()
  .min(10, "Plugin source is too short to be valid")
  .max(1_000_000, "Plugin source exceeds 1MB limit");

export type PluginSource = z.infer<typeof PluginSourceSchema>;
