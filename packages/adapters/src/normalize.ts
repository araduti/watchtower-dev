/**
 * PascalCase → camelCase key normalisation used by the InvokeCommand /
 * Compliance / Teams / SharePoint CSOM adapters.
 *
 * Microsoft's admin REST surfaces (Exchange InvokeCommand, Compliance, Teams
 * Tenant Admin API, SharePoint CSOM ProcessQuery) return PascalCase property
 * names because the payloads are PowerShell cmdlet objects serialised to
 * JSON.  Watchtower's data sources are camelCase by convention, so the
 * adapters normalise on the way in.
 *
 * SharePoint CSOM responses also embed metadata keys that begin with `_`
 * (`_ObjectType_`, `_ObjectIdentity_`, …); the SharePoint-specific variant
 * filters these out.
 */

/** Lower-case the first character.  Empty string is left alone. */
function toCamel(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Recursively normalise PascalCase property names to camelCase.  Arrays and
 * primitives are walked through unchanged structurally.
 *
 * @param value - The value to normalise.  Any JSON-shaped value is accepted.
 * @returns A new value tree with camelCase keys; the original is not mutated.
 */
export function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeKeys);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toCamel(k)] = normalizeKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * SharePoint CSOM variant of {@link normalizeKeys} that also strips metadata
 * keys beginning with an underscore (`_ObjectType_`, `_ObjectIdentity_`,
 * `_ObjectVersion_`, …).
 */
export function normalizeCsomKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeCsomKeys);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("_")) continue;
      out[toCamel(k)] = normalizeCsomKeys(v);
    }
    return out;
  }
  return value;
}
