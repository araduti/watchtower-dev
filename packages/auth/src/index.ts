/**
 * @watchtower/auth — Public API
 *
 * Exports the Better Auth server instance and session resolver.
 */

export { auth } from "./auth.ts";
export type { Auth } from "./auth.ts";
export { resolveSession } from "./session.ts";
export type { ResolvedSession } from "./session.ts";
