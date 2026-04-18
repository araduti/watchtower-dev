import { AdapterError } from "./adapter-error.ts";
import { decryptTenantCredentialBundle } from "./credential-bundle.ts";
import type { AdapterConfig, AdapterResult, VendorAdapter } from "./types.ts";
import { WATCHTOWER_ERRORS } from "@watchtower/errors";

const VENDOR_NAME = "exchange-online" as const;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

interface Workload {
  readonly cmdlet: string;
  readonly params?: Record<string, string>;
  readonly transform?: (items: unknown[]) => unknown[];
}

const REQUIRED_ADMIN_ACTIONS = ["update", "moveToDeletedItems", "softDelete", "hardDelete"];
const REQUIRED_DELEGATE_ACTIONS = ["sendAs", "sendOnBehalf", "moveToDeletedItems", "softDelete", "hardDelete"];
const REQUIRED_OWNER_ACTIONS = ["mailboxLogin", "update", "moveToDeletedItems", "softDelete", "hardDelete"];

function checkActions(actual: unknown, required: readonly string[]): boolean {
  if (!Array.isArray(actual)) return false;
  const normalized = new Set(
    actual.filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase()),
  );
  return required.every((action) => normalized.has(action.toLowerCase()));
}

const WORKLOADS = {
  exoTransportRules: { cmdlet: "Get-TransportRule" },
  m365AuditConfig: { cmdlet: "Get-AdminAuditLogConfig" },
  organizationConfig: { cmdlet: "Get-OrganizationConfig" },
  userMailboxes: {
    cmdlet: "Get-Mailbox",
    params: { ResultSize: "Unlimited", Filter: "RecipientTypeDetails -eq 'UserMailbox'" },
    transform: (items) => items.map((item) => {
      const mailbox = item as Record<string, unknown>;
      const auditAdmin = Array.isArray(mailbox["auditAdmin"]) ? mailbox["auditAdmin"] : [];
      const auditDelegate = Array.isArray(mailbox["auditDelegate"]) ? mailbox["auditDelegate"] : [];
      const auditOwner = Array.isArray(mailbox["auditOwner"]) ? mailbox["auditOwner"] : [];

      return {
        ...mailbox,
        auditAdminActionsCompliant: checkActions(auditAdmin, REQUIRED_ADMIN_ACTIONS),
        auditDelegateActionsCompliant: checkActions(auditDelegate, REQUIRED_DELEGATE_ACTIONS),
        auditOwnerActionsCompliant: checkActions(auditOwner, REQUIRED_OWNER_ACTIONS),
      };
    }),
  },
  mailboxAuditBypassAssociations: { cmdlet: "Get-MailboxAuditBypassAssociation", params: { ResultSize: "Unlimited" } },
  sharingPolicies: { cmdlet: "Get-SharingPolicy" },
  transportConfig: { cmdlet: "Get-TransportConfig" },
  owaMailboxPolicies: { cmdlet: "Get-OwaMailboxPolicy" },
  externalInOutlook: { cmdlet: "Get-ExternalInOutlook" },
  roleAssignmentPolicies: { cmdlet: "Get-RoleAssignmentPolicy" },
  transportRules: { cmdlet: "Get-TransportRule" },
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
} as const satisfies Record<string, Workload>;

export type ExchangeSource = keyof typeof WORKLOADS;

export type ExchangeDataSources = {
  readonly [K in ExchangeSource]: unknown[];
};

const SOURCES = Object.keys(WORKLOADS) as ExchangeSource[];

function toCamel(input: string): string {
  return input.charAt(0).toLowerCase() + input.slice(1);
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        toCamel(key),
        normalizeKeys(inner),
      ]),
    );
  }
  return value;
}

function retryDelay(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt + Math.random() * 1000, MAX_DELAY_MS);
}

async function fetchWithRetry(url: string, init: RequestInit, source: string): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 429 || attempt === MAX_RETRIES) return response;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    } catch (cause) {
      if (attempt === MAX_RETRIES) {
        throw new AdapterError({
          message: "Network failure while calling Exchange Online.",
          kind: "transient",
          vendor: VENDOR_NAME,
          dataSource: source,
          watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
          cause,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }
  }

  throw new AdapterError({
    message: "Retry budget exhausted for Exchange Online call.",
    kind: "transient",
    vendor: VENDOR_NAME,
    dataSource: source,
    watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
  });
}

async function acquireExchangeToken(
  clientId: string,
  clientSecret: string,
  msTenantId: string,
  source: string,
): Promise<string> {
  const response = await fetchWithRetry(
    `https://login.microsoftonline.com/${msTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://outlook.office365.com/.default",
        grant_type: "client_credentials",
      }),
    },
    source,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AdapterError({
      message: `Failed to acquire Exchange token (${response.status}).`,
      kind: response.status === 401 || response.status === 403 ? "credentials_invalid" : "transient",
      vendor: VENDOR_NAME,
      dataSource: source,
      vendorStatusCode: response.status,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
      cause: new Error(body),
    });
  }

  const json = (await response.json()) as Record<string, unknown>;
  const token = json["access_token"];
  if (typeof token !== "string") {
    throw new AdapterError({
      message: "Exchange token response missing access_token.",
      kind: "credentials_invalid",
      vendor: VENDOR_NAME,
      dataSource: source,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
    });
  }

  return token;
}

async function invokeCommand(
  source: ExchangeSource,
  token: string,
  tenantName: string,
): Promise<unknown[]> {
  const workload = WORKLOADS[source] as Workload | undefined;
  if (!workload) {
    throw new AdapterError({
      message: `Unknown Exchange source: ${source}`,
      kind: "permanent",
      vendor: VENDOR_NAME,
      dataSource: source,
      watchtowerError: WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
    });
  }
  const anchor = `SystemMailbox{bb558c35-97f1-4cb9-8ff7-d53741dc928c}@${tenantName}`;
  const url = `https://outlook.office365.com/adminapi/beta/${tenantName}/InvokeCommand`;

  let nextUrl: string | null = url;
  const aggregated: unknown[] = [];

  while (nextUrl) {
    const response = await fetchWithRetry(
      nextUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-ResponseFormat": "json",
          "X-AnchorMailbox": anchor,
          Prefer: "odata.maxpagesize=1000",
        },
        body: JSON.stringify({
          CmdletInput: {
            CmdletName: workload.cmdlet,
            Parameters: workload.params ?? {},
          },
        }),
      },
      source,
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const kind = response.status === 429
        ? "rate_limited"
        : response.status === 401 || response.status === 403
        ? "insufficient_scope"
        : response.status >= 500
        ? "transient"
        : "permanent";

      throw new AdapterError({
        message: `${workload.cmdlet} failed (${response.status}).`,
        kind,
        vendor: VENDOR_NAME,
        dataSource: source,
        vendorStatusCode: response.status,
        watchtowerError:
          kind === "rate_limited"
            ? WATCHTOWER_ERRORS.VENDOR.RATE_LIMITED
            : kind === "insufficient_scope"
            ? WATCHTOWER_ERRORS.VENDOR.INSUFFICIENT_SCOPE
            : WATCHTOWER_ERRORS.VENDOR.GRAPH_ERROR,
        cause: new Error(body),
      });
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const values = Array.isArray(raw["value"])
      ? (raw["value"] as unknown[])
      : [raw];

    aggregated.push(...values.map(normalizeKeys));
    nextUrl = typeof raw["@odata.nextLink"] === "string" ? raw["@odata.nextLink"] : null;
  }

  return workload.transform ? workload.transform(aggregated) : aggregated;
}

export class ExchangeAdapter implements VendorAdapter<ExchangeDataSources> {
  readonly name = VENDOR_NAME;

  async collect<K extends ExchangeSource>(
    source: K,
    config: AdapterConfig,
  ): Promise<AdapterResult<ExchangeDataSources[K]>> {
    const credentials = decryptTenantCredentialBundle(config.encryptedCredentials, source);
    const token = await acquireExchangeToken(
      credentials.clientId,
      credentials.clientSecret,
      credentials.msTenantId,
      source,
    );

    const data = await invokeCommand(source, token, credentials.complianceTenantName ?? credentials.msTenantId);

    return {
      data: data as ExchangeDataSources[K],
      collectedAt: new Date().toISOString(),
      apiCallCount: 2,
      missingScopes: [],
    };
  }

  listSources(): readonly ExchangeSource[] {
    return SOURCES;
  }

  requiredScopes<K extends ExchangeSource>(_source: K): readonly string[] {
    return ["Exchange.ManageAsApp"];
  }
}

export function createExchangeAdapter(): ExchangeAdapter {
  return new ExchangeAdapter();
}
