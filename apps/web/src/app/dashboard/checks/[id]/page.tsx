"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Tag,
  FileText,
  Lightbulb,
  Wrench,
  Database,
  Settings2,
  Plug,
  Package,
  CalendarDays,
} from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { ClientDate } from "@/components/shared/client-date";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CheckSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type CheckSource = "BUILTIN" | "PLUGIN";

/* ------------------------------------------------------------------ */
/*  Severity configuration                                             */
/* ------------------------------------------------------------------ */

const SEVERITY_CONFIG: Record<
  CheckSeverity,
  {
    variant: "critical" | "high" | "medium" | "low" | "informational";
    label: string;
    glow: "red" | "amber" | "amber" | "blue" | "none";
  }
> = {
  CRITICAL: { variant: "critical", label: "Critical", glow: "red" },
  HIGH: { variant: "high", label: "High", glow: "amber" },
  MEDIUM: { variant: "medium", label: "Medium", glow: "amber" },
  LOW: { variant: "low", label: "Low", glow: "blue" },
  INFO: { variant: "informational", label: "Info", glow: "none" },
} as const;

const SOURCE_BADGE: Record<
  CheckSource,
  { variant: "secondary" | "outline"; label: string }
> = {
  BUILTIN: { variant: "secondary", label: "Built-in" },
  PLUGIN: { variant: "outline", label: "Plugin" },
} as const;

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

export default function CheckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: check, isLoading, isError, error } = trpc.check.get.useQuery({
    checkId: id,
  });

  /* Loading state */
  if (isLoading) {
    return (
      <PageContainer
        title="Check Detail"
        description="Loading check information…"
        actions={
          <Link
            href="/dashboard/checks"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Checks
          </Link>
        }
      >
        <LoadingState rows={6} />
      </PageContainer>
    );
  }

  /* Error state */
  if (isError || !check) {
    return (
      <PageContainer
        title="Check Detail"
        description="Check not found or could not be loaded"
        actions={
          <Link
            href="/dashboard/checks"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Checks
          </Link>
        }
      >
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10 text-red-400" />}
          title="Check not found"
          description={
            error?.message ?? "The requested check does not exist or could not be loaded."
          }
        />
      </PageContainer>
    );
  }

  const severity = check.severity as CheckSeverity;
  const source = check.source as CheckSource;
  const severityConfig = SEVERITY_CONFIG[severity];
  const sourceConfig = SOURCE_BADGE[source];

  return (
    <PageContainer
      title={check.title}
      description="Compliance check details and configuration"
      actions={
        <Link
          href="/dashboard/checks"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Checks
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Check info card */}
        <GlowCard glow={severityConfig.glow} className="p-6">
          {/* Card header */}
          <div className="flex items-center justify-between gap-4 border-b border-border/20 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/30">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {check.title}
                </h2>
                <p className="text-xs font-mono text-muted-foreground">
                  {check.slug}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={severityConfig.variant}>{severityConfig.label}</Badge>
              <Badge variant={sourceConfig.variant}>{sourceConfig.label}</Badge>
            </div>
          </div>

          {/* Details grid — 2 columns */}
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <DetailRow
              icon={<Tag className="h-4 w-4" />}
              label="Slug"
              value={check.slug}
              mono
            />
            <DetailRow
              icon={<Settings2 className="h-4 w-4" />}
              label="Version"
              value={check.version}
              mono
            />
            <DetailRow
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Severity"
              value={
                <Badge variant={severityConfig.variant}>{severityConfig.label}</Badge>
              }
            />
            <DetailRow
              icon={<Package className="h-4 w-4" />}
              label="Source"
              value={
                <Badge variant={sourceConfig.variant}>{sourceConfig.label}</Badge>
              }
            />
            <DetailRow
              icon={<Package className="h-4 w-4" />}
              label="Product"
              value={check.product ?? "—"}
            />
            <DetailRow
              icon={<CalendarDays className="h-4 w-4" />}
              label="Created"
              value={<ClientDate value={check.createdAt} variant="datetime" />}
            />
          </div>
        </GlowCard>

        {/* Description */}
        <GlowCard glow="none" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Description</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {check.description || "No description available."}
          </p>
        </GlowCard>

        {/* Rationale */}
        <GlowCard glow="none" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Rationale</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {check.rationale || "No rationale provided."}
          </p>
        </GlowCard>

        {/* Remediation */}
        <GlowCard glow="none" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Remediation</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {check.remediation || "No remediation steps available."}
          </p>
        </GlowCard>

        {/* Technical Details */}
        <GlowCard glow="blue" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Technical Details</h2>
          </div>

          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <DetailRow
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Graph Scopes"
              value={
                check.graphScopes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {check.graphScopes.map((scope: string) => (
                      <Badge key={scope} variant="outline" className="font-mono text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            />
            <DetailRow
              icon={<Database className="h-4 w-4" />}
              label="Data Source"
              value={check.dataSource ?? "—"}
              mono
            />
            <DetailRow
              icon={<Settings2 className="h-4 w-4" />}
              label="Property"
              value={check.property ?? "—"}
              mono
            />
            <DetailRow
              icon={<Plug className="h-4 w-4" />}
              label="Connectors"
              value={
                check.connectors.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {check.connectors.map((connector: string) => (
                      <Badge key={connector} variant="outline" className="font-mono text-xs">
                        {connector}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            />
            <DetailRow
              icon={<Package className="h-4 w-4" />}
              label="Product"
              value={check.product ?? "—"}
            />
            {check.pluginRepoId && (
              <DetailRow
                icon={<Plug className="h-4 w-4" />}
                label="Plugin Repository ID"
                value={check.pluginRepoId}
                mono
              />
            )}
          </div>
        </GlowCard>
      </div>
    </PageContainer>
  );
}
