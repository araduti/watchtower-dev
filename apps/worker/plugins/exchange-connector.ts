/**
 * exchange-connector.ts
 *
 * Runs Exchange Online / Defender cmdlets via the undocumented InvokeCommand REST endpoint.
 * This is the same transport the ExchangeOnlineManagement PowerShell module uses internally.
 *
 * Auth: delegated token scoped to https://outlook.office365.com/.default
 *   - For testing: obtain via Graph Explorer or any OAuth flow with your admin account
 *   - For production: swap to app-only (Exchange.ManageAsApp + View-Only Org Management role)
 *
 * Env vars required:
 *   EXO_TOKEN    — bearer token for outlook.office365.com
 *   EXO_TENANT   — tenant domain or GUID e.g. contoso.onmicrosoft.com
 *   EXO_ANCHOR   — anchor mailbox UPN e.g. admin@contoso.onmicrosoft.com
 *                  (for app-only use: SystemMailbox{bb558c35-97f1-4cb9-8ff7-d53741dc928c}@{tenantId})
 *
 * Usage:
 *   bun run plugins/exchange-connector.ts
 *
 * Output:
 *   plugins/exchange-snapshot.json
 *
 * ⚠️  InvokeCommand is undocumented and unsupported by Microsoft. It can change without notice.
 */

const CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const TENANT_ID     = process.env.AZURE_TENANT_ID;
const TENANT        = process.env.EXO_TENANT ?? TENANT_ID;

if (!CLIENT_ID)     throw new Error("AZURE_CLIENT_ID is not set");
if (!CLIENT_SECRET) throw new Error("AZURE_CLIENT_SECRET is not set");
if (!TENANT_ID)     throw new Error("AZURE_TENANT_ID is not set");

// ─── Acquire token via client credentials ─────────────────────────────────────

const tokenResponse = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         "https://outlook.office365.com/.default",
      grant_type:    "client_credentials",
    }),
  }
);

if (!tokenResponse.ok) {
  throw new Error(`Token acquisition failed: ${await tokenResponse.text()}`);
}

const tokenData = await tokenResponse.json() as any;
if (tokenData.error) throw new Error(`Token error: ${tokenData.error} — ${tokenData.error_description}`);

const TOKEN = tokenData.access_token;
console.log("[exchange-connector] Token acquired ✅");

// System mailbox anchor — well-known GUID, same across all tenants
const ANCHOR = `SystemMailbox{bb558c35-97f1-4cb9-8ff7-d53741dc928c}@${TENANT_ID}`;
const BASE_URL = `https://outlook.office365.com/adminapi/beta/${TENANT}/InvokeCommand`;

const headers = {
  "Authorization":    `Bearer ${TOKEN}`,
  "Content-Type":     "application/json",
  "X-ResponseFormat": "json",
  "X-AnchorMailbox":  ANCHOR,
  "Prefer":           "odata.maxpagesize=1000",
};

// ─── Normalize PascalCase keys to camelCase ──────────────────────────────────

function toCamel(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function normalizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), normalizeKeys(v)])
    );
  }
  return obj;
}

// ─── InvokeCommand helper ─────────────────────────────────────────────────────

async function invokeCommand(
  cmdlet: string,
  parameters: Record<string, any> = {}
): Promise<any[]> {
  const body = {
    CmdletInput: {
      CmdletName: cmdlet,
      Parameters: parameters,
    },
  };

  let allResults: any[] = [];
  let url: string | null = BASE_URL;

  while (url) {
    const response = await fetch(url, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${cmdlet} failed (${response.status}): ${errorText}`);
    }

    const json = await response.json() as any;
    const raw = json?.value ?? (Array.isArray(json) ? json : [json]);
    const value = raw.map(normalizeKeys);
    allResults = allResults.concat(value);

    // Handle pagination via @odata.nextLink
    url = json?.["@odata.nextLink"] ?? null;
  }

  return allResults;
}

// ─── Workloads ────────────────────────────────────────────────────────────────

interface Workload {
  key:    string;
  label:  string;
  cmdlet: string;
  params?: Record<string, any>;
  // post-process: normalize the result array if needed
  transform?: (items: any[]) => any[];
}

const workloads: Workload[] = [
  // ── exchange-online ────────────────────────────────────────────────────────
  {
    key:    "organizationConfig",
    label:  "Organization Config",
    cmdlet: "Get-OrganizationConfig",
    params: {},
  },
  {
    key:    "userMailboxes",
    label:  "User Mailboxes (Audit)",
    cmdlet: "Get-Mailbox",
    params: { ResultSize: "Unlimited", Filter: "RecipientTypeDetails -eq 'UserMailbox'" },
    // Note: normalizeKeys runs BEFORE transform, so keys are already camelCase here
    transform: (items) => items.map((m: any) => ({
      userPrincipalName:             m.userPrincipalName,
      displayName:                   m.displayName,
      auditEnabled:                  m.auditEnabled,
      auditAdmin:                    m.auditAdmin   ?? [],
      auditDelegate:                 m.auditDelegate ?? [],
      auditOwner:                    m.auditOwner    ?? [],
      // Pre-compute compliance booleans for 6.1.2
      auditAdminActionsCompliant:    checkActions(m.auditAdmin,   REQUIRED_ADMIN_ACTIONS),
      auditDelegateActionsCompliant: checkActions(m.auditDelegate, REQUIRED_DELEGATE_ACTIONS),
      auditOwnerActionsCompliant:    checkActions(m.auditOwner,   REQUIRED_OWNER_ACTIONS),
    })),
  },
  {
    key:    "mailboxAuditBypassAssociations",
    label:  "Mailbox Audit Bypass",
    cmdlet: "Get-MailboxAuditBypassAssociation",
    params: { ResultSize: "Unlimited" },
  },
  {
    key:    "sharingPolicies",
    label:  "Sharing Policies",
    cmdlet: "Get-SharingPolicy",
    params: {},
  },

  // ── 6.2.1 forwarding checks ───────────────────────────────────────────────────
  {
    key:    "transportConfig",
    label:  "Transport Config",
    cmdlet: "Get-TransportConfig",
    params: {},
  },
  {
    key:    "owaMailboxPolicies",
    label:  "OWA Mailbox Policies",
    cmdlet: "Get-OwaMailboxPolicy",
    params: {},
  },
  {
    key:    "externalInOutlook",
    label:  "External In Outlook",
    cmdlet: "Get-ExternalInOutlook",
    params: {},
  },
  {
    key:    "roleAssignmentPolicies",
    label:  "Role Assignment Policies",
    cmdlet: "Get-RoleAssignmentPolicy",
    params: {},
  },

  {
    key:    "transportRules",
    label:  "Transport Rules",
    cmdlet: "Get-TransportRule",
    params: {},
  },

  // ── defender-exchange ──────────────────────────────────────────────────────
  {
    key:    "adminAuditLogConfig",
    label:  "Admin Audit Log Config",
    cmdlet: "Get-AdminAuditLogConfig",
    params: {},
  },
  {
    key:    "safeLinksPolicies",
    label:  "Safe Links Policies",
    cmdlet: "Get-SafeLinksPolicy",
    params: {},
  },
  {
    key:    "safeAttachmentPolicies",
    label:  "Safe Attachment Policies",
    cmdlet: "Get-SafeAttachmentPolicy",
    params: {},
  },
  {
    key:    "malwareFilterPolicies",
    label:  "Malware Filter Policies",
    cmdlet: "Get-MalwareFilterPolicy",
    params: {},
  },
  {
    key:    "malwareFilterRules",
    label:  "Malware Filter Rules",
    cmdlet: "Get-MalwareFilterRule",
    params: {},
  },
  {
    key:    "hostedConnectionFilterPolicies",
    label:  "Connection Filter Policies",
    cmdlet: "Get-HostedConnectionFilterPolicy",
    params: {},
  },
  {
    key:    "hostedContentFilterPolicies",
    label:  "Content Filter Policies",
    cmdlet: "Get-HostedContentFilterPolicy",
    params: {},
  },
  {
    key:    "hostedOutboundSpamFilterPolicies",
    label:  "Outbound Spam Filter Policies",
    cmdlet: "Get-HostedOutboundSpamFilterPolicy",
    params: {},
  },
  {
    key:    "antiPhishPolicies",
    label:  "Anti-Phish Policies",
    cmdlet: "Get-AntiPhishPolicy",
    params: {},
  },
  {
    key:    "atpPolicyForO365",
    label:  "ATP Policy for O365",
    cmdlet: "Get-AtpPolicyForO365",
    params: {},
  },
  {
    key:    "atpProtectionPolicyRules",
    label:  "ATP Protection Policy Rules",
    cmdlet: "Get-ATPProtectionPolicyRule",
    params: {},
  },
  {
    key:    "teamsProtectionPolicies",
    label:  "Teams Protection Policies",
    cmdlet: "Get-TeamsProtectionPolicy",
    params: {},
  },
  {
    key:    "teamsProtectionPolicyRules",
    label:  "Teams Protection Policy Rules",
    cmdlet: "Get-TeamsProtectionPolicyRule",
    params: {},
  },
];

// ─── Required audit actions for 6.1.2 ────────────────────────────────────────

const REQUIRED_ADMIN_ACTIONS = [
  "ApplyRecord", "Copy", "Create", "FolderBind", "HardDelete", "MailItemsAccessed",
  "Move", "MoveToDeletedItems", "SendAs", "SendOnBehalf", "Send", "SoftDelete",
  "Update", "UpdateCalendarDelegation", "UpdateFolderPermissions", "UpdateInboxRules",
];

const REQUIRED_DELEGATE_ACTIONS = [
  "ApplyRecord", "Create", "FolderBind", "HardDelete", "Move", "MailItemsAccessed",
  "MoveToDeletedItems", "SendAs", "SendOnBehalf", "SoftDelete", "Update",
  "UpdateFolderPermissions", "UpdateInboxRules",
];

const REQUIRED_OWNER_ACTIONS = [
  "ApplyRecord", "Create", "HardDelete", "MailboxLogin", "Move", "MailItemsAccessed",
  "MoveToDeletedItems", "Send", "SoftDelete", "Update", "UpdateCalendarDelegation",
  "UpdateFolderPermissions", "UpdateInboxRules",
];

function checkActions(actual: string[] | null, required: string[]): boolean {
  if (!actual) return false;
  const actualLower = actual.map((a: string) => a.toLowerCase());
  return required.every(r => actualLower.includes(r.toLowerCase()));
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const start = performance.now();
const snapshotData: Record<string, any> = {};
const findings: { key: string; error: string }[] = [];
const timings: { workload: string; "took (s)": string; items: number }[] = [];

console.log(`[exchange-connector] Running ${workloads.length} workloads in parallel...`);

const results = await Promise.allSettled(
  workloads.map(async (w) => {
    const t0 = performance.now();
    try {
      const raw = await invokeCommand(w.cmdlet, w.params ?? {});
      const data = w.transform ? w.transform(raw) : raw;
      const took = ((performance.now() - t0) / 1000).toFixed(2);
      return { key: w.key, label: w.label, data, took };
    } catch (err: any) {
      const took = ((performance.now() - t0) / 1000).toFixed(2);
      return { key: w.key, label: w.label, data: [], took, error: err.message };
    }
  })
);

for (const res of results) {
  if (res.status === "fulfilled") {
    const { key, label, data, took, error } = res.value as any;
    snapshotData[key] = data;
    timings.push({ workload: label, "took (s)": took, items: data.length });
    if (error) findings.push({ key, error });
  }
}

const totalMs = ((performance.now() - start) / 1000).toFixed(2);

console.log("\n  Per-workload wall times:");
console.table(timings.sort((a, b) => parseFloat(b["took (s)"]) - parseFloat(a["took (s)"])));

if (findings.length > 0) {
  console.log("\n  ❌ Errors:");
  console.table(findings);
}

const outPath = process.env.EXO_OUT_PATH ?? "plugins/exchange-snapshot.json";
await Bun.write(outPath, JSON.stringify(snapshotData, null, 2));
console.log(`\n[exchange-connector] Done in ${totalMs}s → ${outPath}`);
