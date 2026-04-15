/**
 * evaluators/registry.ts
 *
 * The evaluator registry. Loads all built-in evaluator modules and provides
 * O(1) slug-based lookup for the engine.
 *
 * Alias support: some evaluators are referenced by multiple slugs (e.g.
 * ScubaGear camelCase slugs aliasing CIS kebab-case slugs). Register
 * aliases via registerAlias() after loading built-in modules.
 *
 * Customer-authored plugins are registered via registerPlugin(). These
 * evaluators are marked as sandboxed and execute inside Firecracker
 * microVMs — the engine doesn't know the difference because both paths
 * conform to the EvaluatorFn contract.
 *
 * @see docs/decisions/003-plugin-evaluator-contract.md
 * @see docs/decisions/004-single-engine-firecracker-sandbox.md
 */

import type { EvaluatorFn, RegisteredEvaluator } from "./types.ts";
import { builtinEvaluators } from "./builtin/index.ts";

// ---------------------------------------------------------------------------
// Registry state
// ---------------------------------------------------------------------------

/** Internal slug → registered evaluator map */
const registry = new Map<string, RegisteredEvaluator>();

// ---------------------------------------------------------------------------
// Registration functions
// ---------------------------------------------------------------------------

/**
 * Register a single evaluator by slug.
 * Throws if a slug is already registered (prevents silent overwrites).
 */
export function register(slug: string, evaluate: EvaluatorFn): void {
  if (registry.has(slug)) {
    throw new Error(`Evaluator slug "${slug}" is already registered — check for duplicate exports or alias conflicts`);
  }
  registry.set(slug, { evaluate, sandboxed: false });
}

/**
 * Register an alias slug that delegates to an existing evaluator.
 * Used for ScubaGear camelCase → CIS kebab-case mappings.
 */
export function registerAlias(alias: string, targetSlug: string): void {
  const target = registry.get(targetSlug);
  if (!target) {
    throw new Error(`Cannot alias "${alias}" → "${targetSlug}": target slug not registered`);
  }
  if (registry.has(alias)) {
    throw new Error(`Evaluator slug "${alias}" is already registered — check for duplicate exports or alias conflicts`);
  }
  registry.set(alias, target);
}

/**
 * Register a customer-authored plugin evaluator.
 *
 * The plugin is marked as `sandboxed: true`. When the engine resolves
 * this evaluator via getEvaluator(), it receives a wrapper function that
 * dispatches execution to a Firecracker microVM (or dev-mode fallback).
 *
 * The wrapper is constructed by the caller — typically the PluginRepo
 * sync pipeline — which owns the sandbox configuration and lifecycle.
 * This keeps the registry free of sandbox dependencies.
 *
 * @param slug    - The plugin's stable identifier (must match ControlAssertion.evaluatorSlug)
 * @param wrapper - An EvaluatorFn that wraps the sandbox lifecycle
 * @throws If the slug is already registered
 */
export function registerPlugin(slug: string, wrapper: EvaluatorFn): void {
  if (registry.has(slug)) {
    throw new Error(
      `Plugin slug "${slug}" conflicts with an existing evaluator — ` +
      "customer plugins cannot override built-in evaluators"
    );
  }
  registry.set(slug, { evaluate: wrapper, sandboxed: true });
}

/**
 * Unregister a plugin evaluator by slug.
 *
 * Only sandboxed (customer plugin) evaluators can be unregistered.
 * Built-in evaluators are immutable and cannot be removed.
 *
 * @param slug - The plugin slug to remove
 * @returns true if the plugin was removed, false if not found or not a plugin
 */
export function unregisterPlugin(slug: string): boolean {
  const entry = registry.get(slug);
  if (!entry || !entry.sandboxed) {
    return false;
  }
  return registry.delete(slug);
}

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/**
 * Look up an evaluator by slug. Returns undefined if not found.
 */
export function getEvaluator(slug: string): EvaluatorFn | undefined {
  return registry.get(slug)?.evaluate;
}

/**
 * Check whether a registered evaluator is sandboxed (customer plugin).
 */
export function isSandboxed(slug: string): boolean {
  return registry.get(slug)?.sandboxed ?? false;
}

/**
 * Returns the number of registered evaluators (useful for logging/diagnostics).
 */
export function registrySize(): number {
  return registry.size;
}

/**
 * Returns all registered slugs (useful for diagnostics and validation).
 */
export function registeredSlugs(): string[] {
  return Array.from(registry.keys());
}

/**
 * Returns only the slugs of sandboxed (customer plugin) evaluators.
 */
export function sandboxedSlugs(): string[] {
  return Array.from(registry.entries())
    .filter(([, entry]) => entry.sandboxed)
    .map(([slug]) => slug);
}

// ── Load built-in evaluators on import ────────────────────────────────────────

for (const mod of builtinEvaluators) {
  register(mod.slug, mod.evaluate);
}

// ── ScubaGear camelCase aliases ───────────────────────────────────────────────

registerAlias("spfEnabled", "spf-records-published");
registerAlias("dmarcPublished", "dmarc-published");
registerAlias("dmarcReject", "dmarc-reject");
registerAlias("dmarcCISAContact", "dmarc-cisa-contact");
registerAlias("calendarSharingRestricted", "calendar-sharing-restricted");
registerAlias("userConsentRestricted", "user-consent-restricted");
registerAlias("presetPoliciesEnabled", "preset-policies-enabled");
