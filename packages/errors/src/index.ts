/**
 * @watchtower/errors — Public API
 *
 * Re-exports the complete two-layer error code catalog.
 * This is a pure data package with zero runtime dependencies.
 */
export {
  WATCHTOWER_ERRORS,
  flattenErrors,
} from "./codes.ts";

export type {
  TransportCode,
  WatchtowerErrorCode,
  WatchtowerErrorDef,
  RecoveryHint,
  WatchtowerErrorCause,
} from "./codes.ts";
