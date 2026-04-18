"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  AlertTriangle,
  Scan as ScanIcon,
  KeyRound,
  Globe,
  CalendarDays,
  RefreshCw,
  ShieldCheck,
  Layers,
  Check,
  X,
  ExternalLink,
  Lock,
} from "lucide-react";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
} from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { InteractiveButton } from "@/components/shared/interactive-button";
import { DataTable } from "@/components/shared/data-table";
import { ScanStatusIcon } from "@/components/shared/status-icon";
import type { DataTableColumn } from "@/components/shared/data-table";
import { ClientDate } from "@/components/shared/client-date";

/* ------------------------------------------------------------------ */
/*  Status badge configuration                                         */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG = {
  ACTIVE: { variant: "compliant" as const, label: "Active", glow: "green" as const },
  DISCONNECTED: { variant: "high" as const, label: "Disconnected", glow: "amber" as const },
  ERROR: { variant: "critical" as const, label: "Error", glow: "red" as const },
} as const;

const AUTH_LABELS: Record<string, string> = {
  CLIENT_SECRET: "Client Secret",
  WORKLOAD_IDENTITY: "Workload Identity",
};

/* ------------------------------------------------------------------ */
/*  Detail row component                                               */
/* ------------------------------------------------------------------ */

function DetailRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 text-muted-foreground/60 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {label}
        </p>
        <div
          className={
            mono
              ? "mt-0.5 text-sm font-mono text-foreground break-all"
              : "mt-0.5 text-sm text-foreground"
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [consentBanner, setConsentBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Handle consent callback query parameters
  useEffect(() => {
    const consentGranted = searchParams.get("consent_granted");
    const consentError = searchParams.get("consent_error");

    if (consentGranted === "true") {
      setConsentBanner({
        type: "success",
        message:
          "Admin consent granted successfully! Now enter your Client ID and Client Secret to complete the connection.",
      });
    } else if (consentError) {
      setConsentBanner({
        type: "error",
        message: consentError,
      });
    }
  }, [searchParams]);

  const { data: tenant, isLoading, isError, error } = trpc.tenant.get.useQuery({
    tenantId: id,
  });

  /* Loading state */
  if (isLoading) {
    return (
      <PageContainer
        title="Tenant Detail"
        description="Loading tenant information…"
        actions={
          <Link
            href="/dashboard/tenants"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tenants
          </Link>
        }
      >
        <LoadingState rows={6} />
      </PageContainer>
    );
  }

  /* Error state */
  if (isError || !tenant) {
    return (
      <PageContainer
        title="Tenant Detail"
        description="Tenant not found or could not be loaded"
        actions={
          <Link
            href="/dashboard/tenants"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tenants
          </Link>
        }
      >
        <EmptyState
          icon={<Building2 className="h-10 w-10 text-red-400" />}
          title="Tenant not found"
          description={
            error?.message ?? "The requested tenant does not exist or you do not have access."
          }
        />
      </PageContainer>
    );
  }

  const statusConfig = STATUS_CONFIG[tenant.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.ERROR;

  return (
    <PageContainer
      title={tenant.displayName}
      description="Tenant configuration, findings, and scan history"
      actions={
        <Link
          href="/dashboard/tenants"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tenants
        </Link>
      }
    >
      {/* Azure consent callback banner */}
      {consentBanner && (
        <div
          className={cn(
            "mb-4 flex items-center justify-between rounded-2xl px-4 py-3 text-sm",
            consentBanner.type === "success"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-red-500/10 text-red-300",
          )}
        >
          <div className="flex items-center gap-2">
            {consentBanner.type === "success" ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{consentBanner.message}</span>
          </div>
          <button
            onClick={() => setConsentBanner(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tenant details card */}
      <GlowCard glow={statusConfig.glow} className="p-6">
        {/* Card header */}
        <div className="flex items-center justify-between gap-4 border-b border-border/20 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/30">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {tenant.displayName}
              </h2>
              <p className="text-xs font-mono text-muted-foreground">
                {tenant.id}
              </p>
            </div>
          </div>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>

        {/* Details grid — 2 columns */}
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          <DetailRow
            icon={<Globe className="h-4 w-4" />}
            label="M365 Tenant ID"
            value={tenant.msTenantId}
            mono
          />
          <DetailRow
            icon={<Layers className="h-4 w-4" />}
            label="Scope ID"
            value={tenant.scopeId}
            mono
          />
          <DetailRow
            icon={<KeyRound className="h-4 w-4" />}
            label="Auth Method"
            value={
              <Badge variant="secondary" className="text-[11px]">
                {AUTH_LABELS[tenant.authMethod] ?? tenant.authMethod}
              </Badge>
            }
          />
          <DetailRow
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Status"
            value={
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            }
          />
          <DetailRow
            icon={<CalendarDays className="h-4 w-4" />}
            label="Created"
            value={<ClientDate value={tenant.createdAt} variant="datetime" />}
          />
          <DetailRow
            icon={<RefreshCw className="h-4 w-4" />}
            label="Last Updated"
            value={<ClientDate value={tenant.updatedAt} variant="datetime" />}
          />
        </div>
      </GlowCard>

      {/* Credential status card */}
      <CredentialStatusCard
        tenantId={id}
        hasCredentials={tenant.hasCredentials}
      />

      {/* Recent Findings & Scans — wired to tRPC */}
      <TenantRecentData tenantId={id} router={router} />
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Scan columns for the tenant detail table                           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScanRecord = Record<string, any>;

const scanColumns: DataTableColumn<ScanRecord>[] = [
  {
    key: "status",
    header: "Status",
    render: (item) => (
      <span className="flex items-center gap-1.5">
        <ScanStatusIcon status={item.status ?? "PENDING"} size={14} />
        <span className="text-xs capitalize">{(item.status ?? "PENDING").toLowerCase()}</span>
      </span>
    ),
  },
  {
    key: "triggeredBy",
    header: "Triggered By",
    render: (item) => (
      <Badge variant="outline" className="text-xs">
        {item.triggeredBy ?? "system"}
      </Badge>
    ),
  },
  {
    key: "checksRun",
    header: "Checks",
    render: (item) => (
      <span className="text-xs text-muted-foreground">
        {item.checksRun ?? 0} run / {item.checksFailed ?? 0} failed
      </span>
    ),
  },
  {
    key: "createdAt",
    header: "Created",
    render: (item) => (
      <ClientDate
        value={item.createdAt}
        variant="date"
        className="text-xs text-muted-foreground font-mono"
      />
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Credential status card                                             */
/* ------------------------------------------------------------------ */

function CredentialStatusCard({
  tenantId,
  hasCredentials,
}: {
  tenantId: string;
  hasCredentials: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    checked: boolean;
    connected: boolean;
    error: string | null;
  } | null>(null);

  const utils = trpc.useUtils();

  const connectionQuery = trpc.tenant.checkConnection.useQuery(
    { tenantId },
    { enabled: false },
  );

  const handleVerifyConnection = async () => {
    setConnectionResult(null);
    const result = await connectionQuery.refetch();
    if (result.data) {
      setConnectionResult({
        checked: true,
        connected: result.data.connected,
        error: result.data.error,
      });
    } else if (result.error) {
      setConnectionResult({
        checked: true,
        connected: false,
        error: result.error.message,
      });
    }
  };

  const handleCredentialsSaved = () => {
    utils.tenant.get.invalidate({ tenantId });
    setConnectionResult(null);
  };

  if (!hasCredentials) {
    return (
      <>
        <GlowCard glow="amber" className="mt-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-amber-300">
                  Credentials Required
                </h3>
                <p className="text-xs text-muted-foreground">
                  Azure AD app credentials must be configured before scans can
                  run.
                </p>
              </div>
            </div>
            <InteractiveButton
              icon={<KeyRound className="h-4 w-4" />}
              onClick={() => setDialogOpen(true)}
              className="shrink-0"
            >
              Setup Credentials
            </InteractiveButton>
          </div>
        </GlowCard>

        <SetupCredentialsDialog
          tenantId={tenantId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleCredentialsSaved}
        />
      </>
    );
  }

  return (
    <>
      <GlowCard glow="green" className="mt-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-emerald-300">
                Connected
              </h3>
              <p className="text-xs text-muted-foreground">
                Azure AD credentials are configured for this tenant.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <InteractiveButton
              variant="outline"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={handleVerifyConnection}
              loading={connectionQuery.isFetching}
              loadingText="Verifying…"
            >
              Verify Connection
            </InteractiveButton>
            <InteractiveButton
              variant="outline"
              icon={<Lock className="h-4 w-4" />}
              onClick={() => setDialogOpen(true)}
            >
              Rotate Credentials
            </InteractiveButton>
          </div>
        </div>

        {/* Connection check result */}
        {connectionResult?.checked && (
          <div
            className={cn(
              "mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm",
              connectionResult.connected
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-red-500/10 text-red-300",
            )}
          >
            {connectionResult.connected ? (
              <>
                <Check className="h-4 w-4 shrink-0" />
                Connection verified — tenant is reachable.
              </>
            ) : (
              <>
                <X className="h-4 w-4 shrink-0" />
                <span>
                  Connection failed
                  {connectionResult.error
                    ? `: ${connectionResult.error}`
                    : ""}
                </span>
              </>
            )}
          </div>
        )}
      </GlowCard>

      <SetupCredentialsDialog
        tenantId={tenantId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleCredentialsSaved}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup credentials dialog                                           */
/* ------------------------------------------------------------------ */

function SetupCredentialsDialog({
  tenantId,
  open,
  onOpenChange,
  onSuccess,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const consentUrlQuery = trpc.tenant.getConsentUrl.useQuery(
    { tenantId },
    { enabled: open },
  );

  const mutation = trpc.tenant.setCredentials.useMutation({
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
      setClientId("");
      setClientSecret("");
      setFormError(null);
    },
    onError: (err) => {
      const errorCause = (err.data as Record<string, unknown> | undefined)
        ?.cause as Record<string, unknown> | undefined;
      switch (errorCause?.errorCode) {
        case "WATCHTOWER:TENANT:NOT_FOUND":
          setFormError("Tenant no longer exists.");
          break;
        case "WATCHTOWER:TENANT:INVALID_CREDENTIALS":
          setFormError(
            "The provided credentials are invalid. Please check and try again.",
          );
          break;
        default:
          setFormError(err.message);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!clientId.trim() || !clientSecret.trim()) {
      setFormError("Both Client ID and Client Secret are required.");
      return;
    }

    mutation.mutate({
      idempotencyKey: crypto.randomUUID(),
      tenantId,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            Setup Azure App Credentials
          </DialogTitle>
          <DialogDescription>
            Enter the Azure AD application registration credentials for this
            tenant.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="cred-client-id"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
            >
              Client ID
            </label>
            <Input
              id="cred-client-id"
              type="text"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono text-sm"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="cred-client-secret"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
            >
              Client Secret
            </label>
            <Input
              id="cred-client-secret"
              type="password"
              placeholder="••••••••••••••••••••"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="font-mono text-sm"
              autoComplete="off"
            />
          </div>

          {/* Azure admin consent section */}
          <div className="rounded-2xl border border-border/20 bg-muted/10 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              You can also authorize via Azure admin consent.
            </p>
            {consentUrlQuery.data?.url ? (
              <a
                href={consentUrlQuery.data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Authorize in Azure
              </a>
            ) : (
              <span className="mt-2 inline-block text-xs text-muted-foreground/50">
                Loading consent URL…
              </span>
            )}
          </div>

          {/* Error display */}
          {formError && (
            <div className="flex items-start gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <DialogFooter>
            <InteractiveButton
              type="submit"
              loading={mutation.isPending}
              loadingText="Saving…"
              icon={<Lock className="h-4 w-4" />}
            >
              Save Credentials
            </InteractiveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Tenant recent data sub-component — queries scans for this tenant   */
/* ------------------------------------------------------------------ */

function TenantRecentData({
  tenantId,
  router,
}: {
  tenantId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const scansQuery = trpc.scan.list.useQuery({
    tenantId,
    limit: 5,
  });

  const scans = scansQuery.data?.items ?? [];

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <GlowCard className="p-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">
          Recent Findings
        </h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            Findings for this tenant will appear here after a scan completes.
          </p>
        </div>
      </GlowCard>

      <GlowCard className="p-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">
          Recent Scans
        </h2>
        {scansQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground animate-pulse">
              Loading scans…
            </span>
          </div>
        ) : scans.length > 0 ? (
          <DataTable
            columns={scanColumns}
            data={scans}
            getKey={(item: ScanRecord) => item.id}
            onRowClick={(item: ScanRecord) =>
              router.push(`/dashboard/scans/${item.id}`)
            }
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ScanIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No scans have been run for this tenant yet.
            </p>
          </div>
        )}
      </GlowCard>
    </div>
  );
}
