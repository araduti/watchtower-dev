"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Scan } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { PageContainer, DashboardGrid } from "@/components/shared/layouts";
import { GlowCard, MetricCard } from "@/components/shared/glow-card";
import { MetricCardSkeleton } from "@/components/shared/empty-loading";
import { EmptyState } from "@/components/shared/empty-loading";
import { Badge } from "@watchtower/ui/badge";
import { FadeIn, StaggerGroup } from "@/components/shared/fade-in";
import { ScanStatusIcon, FindingStateIcon } from "@/components/shared/status-icon";
import { DataTable } from "@/components/shared/data-table";
import type { DataTableColumn } from "@/components/shared/data-table";

/* ------------------------------------------------------------------ */
/*  Severity helpers                                                   */
/* ------------------------------------------------------------------ */

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";

const severityVariant: Record<Severity, "destructive" | "default" | "secondary" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "default",
  LOW: "secondary",
  INFORMATIONAL: "outline",
};

const severityClass: Record<Severity, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  INFORMATIONAL: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Finding = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScanRecord = Record<string, any>;

const findingColumns: DataTableColumn<Finding>[] = [
  {
    key: "checkSlug",
    header: "Check Slug",
    mono: true,
    render: (item) => (
      <span className="font-mono text-xs text-muted-foreground">
        {item.checkSlug ?? item.checkId ?? "—"}
      </span>
    ),
  },
  {
    key: "severity",
    header: "Severity",
    render: (item) => {
      const sev = (item.severity ?? "INFORMATIONAL") as Severity;
      return (
        <Badge variant={severityVariant[sev]} className={severityClass[sev]}>
          {sev}
        </Badge>
      );
    },
  },
  {
    key: "state",
    header: "Status",
    render: (item) => (
      <span className="flex items-center gap-1.5">
        <FindingStateIcon state={item.state ?? "open"} size={14} />
        <span className="text-xs capitalize">{(item.state ?? "open").replace("_", " ")}</span>
      </span>
    ),
  },
  {
    key: "lastSeen",
    header: "Last Seen",
    render: (item) => (
      <span className="text-xs text-muted-foreground font-mono">
        {item.lastSeenAt
          ? new Date(item.lastSeenAt).toLocaleDateString()
          : item.updatedAt
            ? new Date(item.updatedAt).toLocaleDateString()
            : "—"}
      </span>
    ),
  },
];

const scanColumns: DataTableColumn<ScanRecord>[] = [
  {
    key: "tenantId",
    header: "Tenant ID",
    mono: true,
    render: (item) => (
      <span className="font-mono text-xs text-muted-foreground" title={item.tenantId}>
        {item.tenantId ? `${item.tenantId.slice(0, 8)}…` : "—"}
      </span>
    ),
  },
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
    key: "createdAt",
    header: "Created",
    render: (item) => (
      <span className="text-xs text-muted-foreground font-mono">
        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardOverviewPage() {
  const router = useRouter();

  const findingsQuery = trpc.finding.list.useQuery({ limit: 5 });
  const scansQuery = trpc.scan.list.useQuery({ limit: 5 });
  const tenantsQuery = trpc.tenant.list.useQuery({ limit: 1 });

  const isMetricsLoading =
    findingsQuery.isLoading || tenantsQuery.isLoading;

  /* Derived KPI values */
  const findings = findingsQuery.data?.items ?? [];
  const scans = scansQuery.data?.items ?? [];
  const tenantCount = tenantsQuery.data?.items?.length ?? 0;

  const totalFindings = findings.length;
  const critHighCount = findings.filter(
    (f: Finding) => f.severity === "CRITICAL" || f.severity === "HIGH",
  ).length;

  return (
    <PageContainer
      title="Dashboard"
      description="Workspace compliance posture overview"
    >
      {/* ── KPI Metrics Row ─────────────────────────────────────── */}
      <StaggerGroup direction="up">
        <FadeIn direction="up">
          <DashboardGrid cols={4}>
            {isMetricsLoading ? (
              <>
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
              </>
            ) : (
              <>
                <MetricCard
                  label="Total Findings"
                  value={totalFindings}
                  sublabel="Across all tenants"
                  glow="red"
                />
                <MetricCard
                  label="Critical / High"
                  value={critHighCount}
                  sublabel="Requires attention"
                  glow="amber"
                />
                <MetricCard
                  label="Tenants"
                  value={tenantCount}
                  sublabel="Connected environments"
                  glow="blue"
                />
                <MetricCard
                  label="Compliance Score"
                  value="—"
                  sublabel="Weighted average"
                  glow="green"
                />
              </>
            )}
          </DashboardGrid>
        </FadeIn>
      </StaggerGroup>

      {/* ── Recent Findings & Scans ─────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FadeIn direction="up" delay={0.1}>
          <GlowCard className="p-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-4">
              Recent Findings
            </h2>
            {findingsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-sm text-muted-foreground animate-pulse">
                  Loading findings…
                </span>
              </div>
            ) : findings.length > 0 ? (
              <DataTable
                columns={findingColumns}
                data={findings}
                getKey={(item: Finding) => item.id}
                onRowClick={(item: Finding) =>
                  router.push(`/dashboard/findings/${item.id}`)
                }
              />
            ) : (
              <EmptyState
                icon={
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
                }
                title="No findings yet"
                description="Trigger a scan to begin compliance checks."
              />
            )}
          </GlowCard>
        </FadeIn>

        <FadeIn direction="up" delay={0.2}>
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
              <EmptyState
                icon={
                  <Scan className="h-8 w-8 text-muted-foreground/40" />
                }
                title="No scans yet"
                description="No scans have been run yet."
              />
            )}
          </GlowCard>
        </FadeIn>
      </div>
    </PageContainer>
  );
}
