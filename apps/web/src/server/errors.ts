/**
 * @module server/errors
 *
 * tRPC error factory bridging @watchtower/errors to TRPCError.
 */

import { TRPCError } from "@trpc/server";
import type {
  WatchtowerErrorDef,
  RecoveryHint,
  TransportCode,
} from "@watchtower/errors";

const TRANSPORT_TO_TRPC: Record<TransportCode, TRPCError["code"]> = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
};

/**
 * Throw a Watchtower error with proper Layer 1 + Layer 2 codes.
 * Always throws — return type is `never`.
 */
export function throwWatchtowerError(
  errorDef: WatchtowerErrorDef,
  opts?: {
    message?: string;
    recovery?: RecoveryHint;
  },
): never {
  throw new TRPCError({
    code: TRANSPORT_TO_TRPC[errorDef.transport],
    message: opts?.message ?? errorDef.message,
    cause: {
      errorCode: errorDef.code,
      recovery: opts?.recovery,
    },
  });
}
