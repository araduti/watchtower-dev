/**
 * Exchange Online adapter.
 *
 * Implements `VendorAdapter<ExchangeDataSources>` using the InvokeCommand
 * REST endpoint
 * (`https://outlook.office365.com/adminapi/beta/{tenant}/InvokeCommand`).
 * This is the same transport the ExchangeOnlineManagement PowerShell
 * module uses internally — undocumented and unsupported by Microsoft, but
 * the only practical way to read management cmdlet output from a service.
 *
 * Each data source is one cmdlet invocation.  The adapter:
 *   1. Decrypts the tenant credentials at the boundary
 *   2. Acquires an `outlook.office365.com/.default` token
 *   3. POSTs the cmdlet body, follows `@odata.nextLink` pagination
 *   4. Normalises PascalCase → camelCase keys
 *   5. Translates HTTP errors to typed `AdapterError`
 *
 * Per-tenant concurrency is enforced by the shared semaphore cache.
 *
 * @see docs/Code-Conventions.md §6 — Vendor adapter boundary
 * @see docs/decisions/003-vendor-adapter-boundary.md
 */

import type { VendorAdapter, AdapterConfig, AdapterResult } from "./types.ts";
import type {
  ExchangeAdapterConfig,
  ExchangeDataSources,
  ExchangeDataSourceKey,
} from "./exchange-types.ts";
import { AdapterError } from "./adapter-error.ts";
import { decryptCredentialBundle } from "./credential-decrypt.ts";
import { getTenantSemaphore } from "./concurrency.ts";
import { normalizeKeys } from "./normalize.ts";
import { acquireSecretToken } from "./oauth.ts";
import { withRetry, classifyHttpStatus, type RetryDecision } from "./retry.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

const VENDOR_NAME = "exchange-online" as const;
const DEFAULT_MAX_CONCURRENCY = 4;
const SCOPE = "https://outlook.office365.com/.default";

// ---------------------------------------------------------------------------
// Workload registry — one entry per data source
// ---------------------------------------------------------------------------

interface Workload {
  /** Cmdlet name, e.g. "Get-OrganizationConfig". */
  readonly cmdlet: string;
  /** Optional cmdlet parameters. */
  readonly params?: Readonly<Record<string, unknown>>;
  /**
   * Optional post-processing applied AFTER camelCase normalisation.  Used by
   * `userMailboxes` to pre-compute the 6.1.2 audit-action compliance flags.
   */
  readonly transform?: (
    items: ReadonlyArray<Record<string, unknown>>,
  ) => ReadonlyArray<Record<string, unknown>>;
}

const WORKLOADS: Readonly<Record<ExchangeDataSourceKey, Workload>> = {
  organizationConfig: { cmdlet: "Get-OrganizationConfig" },
  userMailboxes: {
    cmdlet: "Get-Mailbox",
    params: {
      ResultSize: "Unlimited",
      Filter: "RecipientTypeDetails -eq 'UserMailbox'",
    },
    transform: (items) => items.map(projectMailboxAuditCompliance),
  },
  mailboxAuditBypassAssociations: {
    cmdlet: "Get-MailboxAuditBypassAssociation",
    params: { ResultSize: "Unlimited" },
  },
  sharingPolicies: { cmdlet: "Get-SharingPolicy" },
  transportConfig: { cmdlet: "Get-TransportConfig" },
  owaMailboxPolicies: { cmdlet: "Get-OwaMailboxPolicy" },
  externalInOutlook: { cmdlet: "Get-ExternalInOutlook" },
  roleAssignmentPolicies: { cmdlet: "Get-RoleAssignmentPolicy" },
  transportRules: { cmdlet: "Get-TransportRule" },

  // Defender for Office 365
  adminAuditLogConfig: { cmdlet: "Get-AdminAuditLogConfig" },
  safeLinksPolicies: { cmdlet: "Get-SafeLinksPolicy" },
  safeAttachmentPolicies: { cmdlet: "Get-SafeAttachmentPolicy" },
  malwareFilterPolicies: { cmdlet: "Get-MalwareFilterPolicy" },
  malwareFilterRules: { cmdlet: "Get-MalwareFilterRule" },
  hostedConnectionFilterPolicies: { cmdlet: "Get-HostedConnectionFilterPolicy" },
  hostedContentFilterPolicies: { cmdlet: "Get-HostedContentFilterPolicy" },
  hostedOutboundSpamFilterPolicies: { cmdlet: "Get-HostedOutboundSpamFilterPolicy" },
  antiPhishPolicies: { cmdlet: "Get-AntiPhishPolicy" },
  atpPolicyForO365: { cmdlet: "Get-AtpPolicyForO365" },
  atpProtectionPolicyRules: { cmdlet: "Get-ATPProtectionPolicyRule" },
  teamsProtectionPolicies: { cmdlet: "Get-TeamsProtectionPolicy" },
  teamsProtectionPolicyRules: { cmdlet: "Get-TeamsProtectionPolicyRule" },
};

const ALL_SOURCES = Object.keys(WORKLOADS) as ExchangeDataSourceKey[];

// ---------------------------------------------------------------------------
// CIS 6.1.2 — Required mailbox audit actions
// ---------------------------------------------------------------------------

const REQUIRED_ADMIN_ACTIONS = [
  "ApplyRecord", "Copy", "Create", "FolderBind", "HardDelete",
  "MailItemsAccessed", "Move", "MoveToDeletedItems", "SendAs",
  "SendOnBehalf", "Send", "SoftDelete", "Update",
  "UpdateCalendarDelegation", "UpdateFolderPermissions", "UpdateInboxRules",
] as const;

const REQUIRED_DELEGATE_ACTIONS = [
  "ApplyRecord", "Create", "FolderBind", "HardDelete", "Move",
  "MailItemsAccessed", "MoveToDeletedItems", "SendAs", "SendOnBehalf",
  "SoftDelete", "Update", "UpdateFolderPermissions", "UpdateInboxRules",
] as const;

const REQUIRED_OWNER_ACTIONS = [
  "ApplyRecord", "Create", "HardDelete", "MailboxLogin", "Move",
  "MailItemsAccessed", "MoveToDeletedItems", "Send", "SoftDelete", "Update",
  "UpdateCalendarDelegation", "UpdateFolderPermissions", "UpdateInboxRules",
] as const;

function actionsCompliant(
  actual: unknown,
  required: ReadonlyArray<string>,
): boolean {
  if (!Array.isArray(actual)) return false;
  const lower = actual
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.toLowerCase());
  return required.every((r) => lower.includes(r.toLowerCase()));
}

/**
 * Project a `Get-Mailbox` row down to the audit-relevant fields and
 * pre-compute 6.1.2 compliance flags.  Mirrors the v2 connector behaviour
 * so existing evaluators see the same shape.
 */
function projectMailboxAuditCompliance(
  m: Record<string, unknown>,
): Record<string, unknown> {
  const auditAdmin = m["auditAdmin"] ?? [];
  const auditDelegate = m["auditDelegate"] ?? [];
  const auditOwner = m["auditOwner"] ?? [];
  return {
    userPrincipalName: m["userPrincipalName"],
    displayName: m["displayName"],
    auditEnabled: m["auditEnabled"],
    auditAdmin,
    auditDelegate,
    auditOwner,
    auditAdminActionsCompliant: actionsCompliant(auditAdmin, REQUIRED_ADMIN_ACTIONS),
    auditDelegateActionsCompliant: actionsCompliant(auditDelegate, REQUIRED_DELEGATE_ACTIONS),
    auditOwnerActionsCompliant: actionsCompliant(auditOwner, REQUIRED_OWNER_ACTIONS),
  };
}

// ---------------------------------------------------------------------------
// HTTP error helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(`Exchange InvokeCommand failed (${status})`);
    this.name = "HttpError";
  }
}

function inspectRetry(err: unknown): RetryDecision {
  if (!(err instanceof HttpError)) return { retryable: false };
  const retry =
    err.status === 429 || (err.status >= 500 && err.status < 600);
  if (!retry) return { retryable: false };
  return {
    retryable: true,
    retryAfterMs:
      err.retryAfterSeconds !== undefined
        ? err.retryAfterSeconds * 1_000
        : undefined,
  };
}

function makeTranslate(dataSource: string) {
  return (err: unknown): AdapterError => {
    if (err instanceof AdapterError) return err;
    if (err instanceof HttpError) {
      const kind = classifyHttpStatus(err.status);
      const watchtowerError =
        kind === "rate_limited"
          ? WATCHTOWER_ERRORS.VENDOR.RATE_LIMITED
          : kind === "insufficient_scope"
            ? WATCHTOWER_ERRORS.VENDOR.INSUFFICIENT_SCOPE
            : kind === "credentials_invalid"
              ? WATCHTOWER_ERRORS.TENANT.CREDENTIALS_INVALID
              : WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR;
      return new AdapterError({
        message: `Exchange InvokeCommand failed (${err.status}).`,
        kind,
        vendor: VENDOR_NAME,
        dataSource,
        vendorStatusCode: err.status,
        retryAfterSeconds: err.retryAfterSeconds,
        watchtowerError,
        cause: new Error(err.body.slice(0, 500)),
      });
    }
    return new AdapterError({
      message:
        err instanceof Error ? err.message : "Unknown Exchange API error.",
      kind: "transient",
      vendor: VENDOR_NAME,
      dataSource,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      cause: err,
    });
  };
}

// ---------------------------------------------------------------------------
// InvokeCommand transport
// ---------------------------------------------------------------------------

interface InvokeContext {
  readonly token: string;
  readonly tenant: string;
  readonly anchor: string;
}

async function invokeCommand(
  ctx: InvokeContext,
  cmdlet: string,
  parameters: Readonly<Record<string, unknown>>,
  dataSource: string,
): Promise<{ items: ReadonlyArray<Record<string, unknown>>; apiCalls: number }> {
  const baseUrl = `https://outlook.office365.com/adminapi/beta/${ctx.tenant}/InvokeCommand`;
  const headers = {
    "Authorization": `Bearer ${ctx.token}`,
    "Content-Type": "application/json",
    "X-ResponseFormat": "json",
    "X-AnchorMailbox": ctx.anchor,
    "Prefer": "odata.maxpagesize=1000",
  };
  const body = JSON.stringify({
    CmdletInput: { CmdletName: cmdlet, Parameters: parameters },
  });

  const items: Record<string, unknown>[] = [];
  let url: string | null = baseUrl;
  let apiCalls = 0;
  const translate = makeTranslate(dataSource);

  while (url) {
    const target: string = url;
    const json: Record<string, unknown> = await withRetry(
      async (): Promise<Record<string, unknown>> => {
        const response = await fetch(target, { method: "POST", headers, body });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const ra = response.headers.get("Retry-After");
          throw new HttpError(
            response.status,
            text,
            ra ? Number(ra) : undefined,
          );
        }
        return (await response.json()) as Record<string, unknown>;
      },
      inspectRetry,
      translate,
    );
    apiCalls++;

    const rawValue = json["value"];
    const rawArray = Array.isArray(rawValue)
      ? rawValue
      : Array.isArray(json)
        ? json
        : [json];
    for (const row of rawArray) {
      const norm = normalizeKeys(row);
      if (norm !== null && typeof norm === "object" && !Array.isArray(norm)) {
        items.push(norm as Record<string, unknown>);
      }
    }

    const next: unknown = json["@odata.nextLink"];
    url = typeof next === "string" ? next : null;
  }

  return { items, apiCalls };
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export class ExchangeAdapter implements VendorAdapter<ExchangeDataSources> {
  readonly name = "exchange-online" as const;

  constructor(private readonly exchangeConfig: ExchangeAdapterConfig = {}) {}

  async collect<K extends ExchangeDataSourceKey & string>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<ExchangeDataSources[K]>> {
    const workload = WORKLOADS[source];
    if (!workload) {
      throw new AdapterError({
        message: `Unknown Exchange data source: ${source}`,
        kind: "permanent",
        vendor: VENDOR_NAME,
        dataSource: source,
        watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      });
    }

    const maxConcurrency =
      this.exchangeConfig.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const semaphore = getTenantSemaphore(
      VENDOR_NAME,
      config.workspaceId,
      config.tenantId,
      maxConcurrency,
    );

    await semaphore.acquire();
    try {
      // Decrypt — plaintext lives only in this closure for one collect() call.
      const bundle = decryptCredentialBundle(
        config.encryptedCredentials,
        VENDOR_NAME,
        source,
      );
      const token = await acquireSecretToken({
        msTenantId: bundle.msTenantId,
        clientId: bundle.clientId,
        clientSecret: bundle.clientSecret,
        scope: SCOPE,
        vendor: VENDOR_NAME,
        dataSource: source,
      });

      // Well-known system mailbox anchor — same GUID across every tenant.
      const anchor = `SystemMailbox{bb558c35-97f1-4cb9-8ff7-d53741dc928c}@${bundle.msTenantId}`;

      const collectedAt = new Date().toISOString();
      const { items, apiCalls } = await invokeCommand(
        { token, tenant: bundle.msTenantId, anchor },
        workload.cmdlet,
        workload.params ?? {},
        source,
      );

      const data = workload.transform ? workload.transform(items) : items;

      return {
        data: data as ExchangeDataSources[K],
        collectedAt,
        apiCallCount: apiCalls,
        missingScopes: [],
      };
    } finally {
      semaphore.release();
    }
  }

  listSources(): readonly (ExchangeDataSourceKey & string)[] {
    return ALL_SOURCES as readonly (ExchangeDataSourceKey & string)[];
  }

  requiredScopes(): readonly string[] {
    // Exchange InvokeCommand requires either:
    //   - Exchange.ManageAsApp (app-only) + Exchange Administrator (View-Only Org Mgmt)
    // There is no per-cmdlet scope — the role grants/denies access uniformly.
    return ["Exchange.ManageAsApp"];
  }
}

export function createExchangeAdapter(
  exchangeConfig: ExchangeAdapterConfig = {},
): ExchangeAdapter {
  return new ExchangeAdapter(exchangeConfig);
}
