"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  AlertTriangle,
  Scan,
  KeyRound,
  Globe,
  CalendarDays,
  RefreshCw,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";

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
            value={new Date(tenant.createdAt).toLocaleString()}
          />
          <DetailRow
            icon={<RefreshCw className="h-4 w-4" />}
            label="Last Updated"
            value={new Date(tenant.updatedAt).toLocaleString()}
          />
        </div>
      </GlowCard>

      {/* Placeholder sections — Recent Findings & Recent Scans */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlowCard className="p-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            Recent Findings
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No findings yet. Trigger a scan to begin compliance monitoring.
            </p>
          </div>
        </GlowCard>

        <GlowCard className="p-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            Recent Scans
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Scan className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No scans have been run for this tenant yet.
            </p>
          </div>
        </GlowCard>
      </div>
    </PageContainer>
  );
}
