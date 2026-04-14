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
 * Phase 5 will extend this to load customer-authored evaluators from
 * PluginRepo-synced files, validated via Zod and executed in a sandbox.
 */

import type { EvaluatorFn } from "./types.ts";
import { builtinEvaluators } from "./builtin/index.ts";

/** Internal slug → evaluator function map */
const registry = new Map<string, EvaluatorFn>();

/**
 * Register a single evaluator by slug.
 * Throws if a slug is already registered (prevents silent overwrites).
 */
export function register(slug: string, evaluate: EvaluatorFn): void {
  if (registry.has(slug)) {
    throw new Error(`Evaluator slug "${slug}" is already registered — check for duplicate exports or alias conflicts`);
  }
  registry.set(slug, evaluate);
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
  register(alias, target);
}

/**
 * Look up an evaluator by slug. Returns undefined if not found.
 */
export function getEvaluator(slug: string): EvaluatorFn | undefined {
  return registry.get(slug);
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
