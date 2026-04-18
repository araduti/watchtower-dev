/**
 * @watchtower/errors — Two-layer error code catalog
 *
 * Layer 1 (TransportCode): HTTP-semantic code for retry/rendering.
 * Layer 2 (WatchtowerErrorCode): WATCHTOWER:DOMAIN:CODE business code.
 *
 * STABILITY CONTRACT: Once shipped, codes are NEVER renamed or removed.
 * Messages are end-user safe — no stack traces, SQL, or internal IDs.
 */

// ---------------------------------------------------------------------------
// Layer 1 — Transport codes
// ---------------------------------------------------------------------------

export type TransportCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR";

// ---------------------------------------------------------------------------
// Layer 2 — Business error catalog
// ---------------------------------------------------------------------------

export const WATCHTOWER_ERRORS = {
  AUTH: {
    SESSION_EXPIRED: {
      code: "WATCHTOWER:AUTH:SESSION_EXPIRED",
      transport: "UNAUTHORIZED",
      message: "Session expired. Please re-authenticate.",
    },
    /** Returns NOT_FOUND (not FORBIDDEN) to prevent resource-existence leaks. */
    INSUFFICIENT_PERMISSION: {
      code: "WATCHTOWER:AUTH:INSUFFICIENT_PERMISSION",
      transport: "NOT_FOUND",
      message: "Resource not found.",
    },
  },

  REQUEST: {
    MISSING_IDEMPOTENCY_KEY: {
      code: "WATCHTOWER:REQUEST:MISSING_IDEMPOTENCY_KEY",
      transport: "BAD_REQUEST",
      message: "Mutations require an idempotencyKey (UUID v4).",
    },
    INVALID_INPUT: {
      code: "WATCHTOWER:REQUEST:INVALID_INPUT",
      transport: "BAD_REQUEST",
      message: "Invalid input.",
    },
    DUPLICATE_IDEMPOTENCY_KEY: {
      code: "WATCHTOWER:REQUEST:DUPLICATE_IDEMPOTENCY_KEY",
      transport: "CONFLICT",
      message: "This request has already been processed.",
    },
  },

  FINDING: {
    NOT_FOUND: {
      code: "WATCHTOWER:FINDING:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Finding not found.",
    },
    ALREADY_MUTED: {
      code: "WATCHTOWER:FINDING:ALREADY_MUTED",
      transport: "CONFLICT",
      message: "This finding has already been muted.",
    },
    ALREADY_ACKNOWLEDGED: {
      code: "WATCHTOWER:FINDING:ALREADY_ACKNOWLEDGED",
      transport: "CONFLICT",
      message: "This finding has already been acknowledged.",
    },
    ACCEPTANCE_MISSING_EXPIRATION: {
      code: "WATCHTOWER:FINDING:ACCEPTANCE_MISSING_EXPIRATION",
      transport: "BAD_REQUEST",
      message: "Risk acceptance requires an expiration date.",
    },
    INVALID_TRANSITION: {
      code: "WATCHTOWER:FINDING:INVALID_TRANSITION",
      transport: "PRECONDITION_FAILED",
      message: "This status transition is not allowed.",
    },
    NOT_MUTED: {
      code: "WATCHTOWER:FINDING:NOT_MUTED",
      transport: "PRECONDITION_FAILED",
      message: "This finding is not muted.",
    },
    NO_ACCEPTANCE: {
      code: "WATCHTOWER:FINDING:NO_ACCEPTANCE",
      transport: "PRECONDITION_FAILED",
      message: "This finding does not have an active risk acceptance.",
    },
  },

  TENANT: {
    NOT_FOUND: {
      code: "WATCHTOWER:TENANT:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Tenant not found.",
    },
    CREDENTIALS_INVALID: {
      code: "WATCHTOWER:TENANT:CREDENTIALS_INVALID",
      transport: "PRECONDITION_FAILED",
      message: "Stored credentials are no longer valid.",
    },
    ALREADY_CONNECTED: {
      code: "WATCHTOWER:TENANT:ALREADY_CONNECTED",
      transport: "CONFLICT",
      message: "This M365 tenant is already connected.",
    },
  },

  SCAN: {
    NOT_FOUND: {
      code: "WATCHTOWER:SCAN:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Scan not found.",
    },
    ALREADY_RUNNING: {
      code: "WATCHTOWER:SCAN:ALREADY_RUNNING",
      transport: "CONFLICT",
      message: "A scan is already in progress.",
    },
    CANNOT_CANCEL: {
      code: "WATCHTOWER:SCAN:CANNOT_CANCEL",
      transport: "PRECONDITION_FAILED",
      message: "This scan cannot be cancelled in its current state.",
    },
  },

  WORKSPACE: {
    NOT_FOUND: {
      code: "WATCHTOWER:WORKSPACE:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Workspace not found.",
    },
    ALREADY_DELETED: {
      code: "WATCHTOWER:WORKSPACE:ALREADY_DELETED",
      transport: "CONFLICT",
      message: "This workspace has already been deleted.",
    },
    CANNOT_TRANSFER_TO_SELF: {
      code: "WATCHTOWER:WORKSPACE:CANNOT_TRANSFER_TO_SELF",
      transport: "BAD_REQUEST",
      message: "Cannot transfer ownership to the current owner.",
    },
    TRANSFER_TARGET_NOT_MEMBER: {
      code: "WATCHTOWER:WORKSPACE:TRANSFER_TARGET_NOT_MEMBER",
      transport: "PRECONDITION_FAILED",
      message: "The target user must be a member of this workspace.",
    },
  },

  SCOPE: {
    NOT_FOUND: {
      code: "WATCHTOWER:SCOPE:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Scope not found.",
    },
    SLUG_TAKEN: {
      code: "WATCHTOWER:SCOPE:SLUG_TAKEN",
      transport: "CONFLICT",
      message: "A scope with this slug already exists in the workspace.",
    },
    HAS_TENANTS: {
      code: "WATCHTOWER:SCOPE:HAS_TENANTS",
      transport: "PRECONDITION_FAILED",
      message: "Scope has connected tenants. Move or disconnect them first.",
    },
  },

  ROLE: {
    NOT_FOUND: {
      code: "WATCHTOWER:ROLE:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Role not found.",
    },
    SYSTEM_ROLE_IMMUTABLE: {
      code: "WATCHTOWER:ROLE:SYSTEM_ROLE_IMMUTABLE",
      transport: "PRECONDITION_FAILED",
      message: "System roles cannot be modified.",
    },
    LOCKED_PERMISSION: {
      code: "WATCHTOWER:ROLE:LOCKED_PERMISSION",
      transport: "BAD_REQUEST",
      message: "This permission cannot be assigned to custom roles.",
    },
  },

  MEMBER: {
    NOT_FOUND: {
      code: "WATCHTOWER:MEMBER:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Member not found.",
    },
    ALREADY_MEMBER: {
      code: "WATCHTOWER:MEMBER:ALREADY_MEMBER",
      transport: "CONFLICT",
      message: "This user is already a member.",
    },
    CANNOT_REMOVE_OWNER: {
      code: "WATCHTOWER:MEMBER:CANNOT_REMOVE_OWNER",
      transport: "PRECONDITION_FAILED",
      message: "Cannot remove the workspace owner.",
    },
  },

  PLUGIN: {
    NOT_FOUND: {
      code: "WATCHTOWER:PLUGIN:NOT_FOUND",
      transport: "NOT_FOUND",
      message: "Plugin repository not found.",
    },
    ALREADY_CONNECTED: {
      code: "WATCHTOWER:PLUGIN:ALREADY_CONNECTED",
      transport: "CONFLICT",
      message: "This repository is already connected to this workspace.",
    },
    CHECK_NOT_APPROVED: {
      code: "WATCHTOWER:PLUGIN:CHECK_NOT_APPROVED",
      transport: "PRECONDITION_FAILED",
      message: "This check must be approved before it can run.",
    },
  },

  VENDOR: {
    GRAPH_ERROR: {
      code: "WATCHTOWER:VENDOR:GRAPH_ERROR",
      transport: "INTERNAL_SERVER_ERROR",
      message: "An error occurred communicating with Microsoft Graph.",
    },
    RATE_LIMITED: {
      code: "WATCHTOWER:VENDOR:RATE_LIMITED",
      transport: "TOO_MANY_REQUESTS",
      message: "Vendor API rate limit exceeded. Please wait.",
    },
    INSUFFICIENT_SCOPE: {
      code: "WATCHTOWER:VENDOR:INSUFFICIENT_SCOPE",
      transport: "PRECONDITION_FAILED",
      message: "Insufficient API permissions on the connected tenant.",
    },
  },

  RATE_LIMIT: {
    EXCEEDED: {
      code: "WATCHTOWER:RATE_LIMIT:EXCEEDED",
      transport: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded. Please slow down.",
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Derived types — all computed from the const catalog
// ---------------------------------------------------------------------------

type ErrorCatalog = typeof WATCHTOWER_ERRORS;
type Domain = keyof ErrorCatalog;
type ErrorEntry<D extends Domain = Domain> = D extends Domain
  ? ErrorCatalog[D][keyof ErrorCatalog[D]]
  : never;

/** Union of every Layer 2 business code string. */
export type WatchtowerErrorCode = ErrorEntry["code"];

/** Shape of a single error definition in the catalog. */
export interface WatchtowerErrorDef {
  readonly code: WatchtowerErrorCode;
  readonly transport: TransportCode;
  readonly message: string;
}

/** Optional recovery hint attached to an error cause. */
export interface RecoveryHint {
  readonly action: string;
  readonly label: string;
  readonly params: Record<string, string>;
}

/** Structured `cause` payload for tRPC errors. */
export interface WatchtowerErrorCause {
  readonly errorCode: WatchtowerErrorCode;
  readonly recovery?: RecoveryHint;
}

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

/**
 * Flatten the nested catalog into a Map keyed by Layer 2 code string.
 * Useful for tests, middleware lookups, and documentation generators.
 */
export function flattenErrors(): Map<string, WatchtowerErrorDef> {
  const map = new Map<string, WatchtowerErrorDef>();

  for (const domainEntries of Object.values(WATCHTOWER_ERRORS)) {
    for (const entry of Object.values(domainEntries)) {
      const def = entry as WatchtowerErrorDef;
      map.set(def.code, def);
    }
  }

  return map;
}
