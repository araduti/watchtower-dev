"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Clock, Hash, User, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { DashboardGrid } from "@/components/shared/layouts";
import { GlowCard, MetricCard } from "@/components/shared/glow-card";
import { LoadingState } from "@/components/shared/empty-loading";
import { Badge } from "@watchtower/ui/badge";
import { ScanStatusIcon } from "@/components/shared/status-icon";
import { InteractiveButton } from "@/components/shared/interactive-button";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Map backend status to the ScanStatusIcon expected values */
function toIconStatus(
  status: string,
): "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" {
  if (status === "SUCCEEDED") return "COMPLETED";
  return status as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
}

/** Human-readable duration between two ISO dates */
function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

/** Format an ISO timestamp for display */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/** Truncate a UUID for display */
function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

/** Badge variant for trigger type */
function triggerBadgeVariant(
  trigger: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (trigger) {
    case "MANUAL":
      return "default";
    case "SCHEDULED":
      return "secondary";
    case "WEBHOOK":
      return "outline";
    case "API":
      return "outline";
    default:
      return "secondary";
  }
}

/* ------------------------------------------------------------------ */
/*  Detail row                                                        */
/* ------------------------------------------------------------------ */

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={
          mono
            ? "font-mono text-sm text-foreground/90"
            : "text-sm text-foreground/90"
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);

  const { data: scan, isLoading, error } = trpc.scan.get.useQuery({ scanId: id });

  const utils = trpc.useUtils();
  const cancelMutation = trpc.scan.cancel.useMutation({
    onSuccess: () => {
      utils.scan.get.invalidate({ scanId: id });
      utils.scan.list.invalidate();
    },
  });

  /* Loading state */
  if (isLoading) {
    return (
      <PageContainer title="Scan Detail" description="Loading scan…">
        <LoadingState rows={6} />
      </PageContainer>
    );
  }

  /* Error state */
  if (error || !scan) {
    return (
      <PageContainer title="Scan Detail" description="Unable to load scan">
        <GlowCard glow="red" className="p-6">
          <p className="text-destructive">
            {error?.message ?? "Scan not found."}
          </p>
        </GlowCard>
      </PageContainer>
    );
  }

  const canCancel = scan.status === "PENDING" || scan.status === "RUNNING";

  return (
    <PageContainer
      title={`Scan ${truncateId(scan.id)}`}
      description="Scan results, evidence, and timeline"
      actions={
        <div className="flex items-center gap-3">
          <ScanStatusIcon status={toIconStatus(scan.status)} size={20} />
          <Badge variant="outline" className="font-mono text-xs">
            {scan.status}
          </Badge>
        </div>
      }
    >
      {/* Back link */}
      <Link
        href="/dashboard/scans"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scans
      </Link>

      {/* KPI row */}
      <DashboardGrid cols={4}>
        <MetricCard
          label="Checks Run"
          value={scan.checksRun}
          glow="blue"
        />
        <MetricCard
          label="Checks Failed"
          value={scan.checksFailed}
          glow={scan.checksFailed > 0 ? "red" : "green"}
        />
        <MetricCard
          label="Status"
          value={scan.status}
          sublabel={
            scan.status === "RUNNING"
              ? "In progress"
              : scan.status === "SUCCEEDED"
                ? "Completed"
                : undefined
          }
          glow={
            scan.status === "SUCCEEDED"
              ? "green"
              : scan.status === "FAILED"
                ? "red"
                : scan.status === "RUNNING"
                  ? "blue"
                  : "amber"
          }
        />
        <MetricCard
          label="Duration"
          value={formatDuration(scan.startedAt, scan.finishedAt)}
          glow="blue"
        />
      </DashboardGrid>

      {/* Details card */}
      <GlowCard className="mt-6 p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Scan Details
        </h3>
        <div className="grid grid-cols-1 gap-x-12 gap-y-5 sm:grid-cols-2">
          <DetailRow label="Scan ID" value={scan.id} mono />
          <DetailRow label="Tenant ID" value={scan.tenantId} mono />
          <DetailRow label="Scope ID" value={scan.scopeId} mono />
          <DetailRow
            label="Triggered By"
            value={
              <Badge variant={triggerBadgeVariant(scan.triggeredBy)}>
                {scan.triggeredBy}
              </Badge>
            }
          />
          <DetailRow
            label="Triggered By User"
            value={
              scan.triggeredByUserId ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {truncateId(scan.triggeredByUserId)}
                </span>
              ) : (
                <span className="text-muted-foreground">System</span>
              )
            }
          />
          <DetailRow
            label="Started At"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {fmtDate(scan.startedAt)}
              </span>
            }
          />
          <DetailRow
            label="Finished At"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {fmtDate(scan.finishedAt)}
              </span>
            }
          />
          <DetailRow
            label="Created At"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {fmtDate(scan.createdAt)}
              </span>
            }
          />
        </div>
      </GlowCard>

      {/* Actions */}
      <div className="mt-6 flex items-center gap-3">
        <InteractiveButton
          variant="destructive"
          disabled={!canCancel}
          loading={cancelMutation.isPending}
          loadingText="Cancelling…"
          icon={<Ban className="h-4 w-4" />}
          onClick={() =>
            cancelMutation.mutate({
              idempotencyKey: crypto.randomUUID(),
              scanId: scan.id,
            })
          }
        >
          Cancel Scan
        </InteractiveButton>
      </div>
    </PageContainer>
  );
}
