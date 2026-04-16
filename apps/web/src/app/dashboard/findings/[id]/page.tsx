"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  VolumeX,
  Eye,
  StickyNote,
} from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { LoadingState, EmptyState } from "@/components/shared/empty-loading";
import { FindingStateIcon } from "@/components/shared/status-icon";
import { InteractiveButton } from "@/components/shared/interactive-button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type FindingStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "ACCEPTED_RISK"
  | "RESOLVED"
  | "NOT_APPLICABLE";
type FindingVisibility = "DEFAULT" | "MUTED";

interface FindingDetail {
  id: string;
  workspaceId: string;
  scopeId: string;
  tenantId: string;
  checkSlug: string;
  status: FindingStatus;
  visibility: FindingVisibility;
  severity: FindingSeverity;
  severityRank: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  regressionFromResolvedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  acceptanceReason: string | null;
  acceptanceExpiresAt: string | null;
  mutedAt: string | null;
  mutedBy: string | null;
  mutedUntil: string | null;
  assignedTo: string | null;
  notes: string | null;
  latestEvidenceId: string | null;
  evidenceDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Severity badge config                                              */
/* ------------------------------------------------------------------ */

const SEVERITY_BADGE: Record<
  FindingSeverity,
  { variant: "critical" | "high" | "medium" | "low" | "informational"; label: string }
> = {
  CRITICAL: { variant: "critical", label: "Critical" },
  HIGH: { variant: "high", label: "High" },
  MEDIUM: { variant: "medium", label: "Medium" },
  LOW: { variant: "low", label: "Low" },
  INFO: { variant: "informational", label: "Info" },
} as const;

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In Progress",
  ACCEPTED_RISK: "Accepted Risk",
  RESOLVED: "Resolved",
  NOT_APPLICABLE: "N/A",
} as const;

const STATUS_TO_ICON_STATE: Record<
  FindingStatus,
  "open" | "acknowledged" | "muted" | "accepted_risk" | "resolved"
> = {
  OPEN: "open",
  ACKNOWLEDGED: "acknowledged",
  IN_PROGRESS: "open",
  ACCEPTED_RISK: "accepted_risk",
  RESOLVED: "resolved",
  NOT_APPLICABLE: "resolved",
} as const;

/* ------------------------------------------------------------------ */
/*  Glow color by severity                                             */
/* ------------------------------------------------------------------ */

const SEVERITY_GLOW: Record<FindingSeverity, "red" | "amber" | "blue" | "green" | "none"> = {
  CRITICAL: "red",
  HIGH: "amber",
  MEDIUM: "amber",
  LOW: "blue",
  INFO: "none",
} as const;

/* ------------------------------------------------------------------ */
/*  Date formatting                                                    */
/* ------------------------------------------------------------------ */

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Detail row                                                         */
/* ------------------------------------------------------------------ */

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-sm text-foreground" : "text-sm text-foreground"}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timeline entry                                                     */
/* ------------------------------------------------------------------ */

function TimelineEntry({
  icon,
  label,
  actor,
  timestamp,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  actor: string | null;
  timestamp: string;
  detail?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground font-mono">{formatDate(timestamp)}</span>
        </div>
        {actor && (
          <p className="text-xs text-muted-foreground mt-0.5">
            by <span className="font-mono">{actor}</span>
          </p>
        )}
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">{detail}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function FindingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isLoading, isError, error } = trpc.finding.get.useQuery({
    findingId: id,
  });

  const finding = data as FindingDetail | undefined;

  /* ---- Loading ---- */
  if (isLoading) {
    return (
      <PageContainer title="Finding Detail" description="Loading finding…">
        <LoadingState rows={6} />
      </PageContainer>
    );
  }

  /* ---- Error ---- */
  if (isError || !finding) {
    return (
      <PageContainer title="Finding Detail" description="Finding lifecycle and evidence">
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load finding"
          description={error?.message ?? "Finding not found or you do not have access."}
        />
      </PageContainer>
    );
  }

  const sevCfg = SEVERITY_BADGE[finding.severity];
  const iconState = STATUS_TO_ICON_STATE[finding.status];
  const glowColor = SEVERITY_GLOW[finding.severity];

  /* ---- Build lifecycle timeline entries ---- */
  const timelineEntries: React.ReactNode[] = [];

  if (finding.acknowledgedAt) {
    timelineEntries.push(
      <TimelineEntry
        key="acknowledged"
        icon={<Eye className="h-4 w-4 text-severity-high" />}
        label="Acknowledged"
        actor={finding.acknowledgedBy}
        timestamp={finding.acknowledgedAt}
      />,
    );
  }

  if (finding.acceptedAt) {
    timelineEntries.push(
      <TimelineEntry
        key="accepted"
        icon={<ShieldAlert className="h-4 w-4 text-severity-medium" />}
        label="Risk Accepted"
        actor={finding.acceptedBy}
        timestamp={finding.acceptedAt}
        detail={finding.acceptanceReason}
      />,
    );
  }

  if (finding.mutedAt) {
    timelineEntries.push(
      <TimelineEntry
        key="muted"
        icon={<VolumeX className="h-4 w-4 text-status-muted" />}
        label="Muted"
        actor={finding.mutedBy}
        timestamp={finding.mutedAt}
        detail={finding.mutedUntil ? `Until ${formatDate(finding.mutedUntil)}` : null}
      />,
    );
  }

  if (finding.resolvedAt) {
    timelineEntries.push(
      <TimelineEntry
        key="resolved"
        icon={<CheckCircle2 className="h-4 w-4 text-status-compliant" />}
        label="Resolved"
        actor={finding.resolvedBy}
        timestamp={finding.resolvedAt}
      />,
    );
  }

  if (finding.regressionFromResolvedAt) {
    timelineEntries.push(
      <TimelineEntry
        key="regression"
        icon={<AlertTriangle className="h-4 w-4 text-severity-critical" />}
        label="Regressed"
        actor={null}
        timestamp={finding.regressionFromResolvedAt}
        detail="Re-opened after previous resolution"
      />,
    );
  }

  return (
    <PageContainer
      title="Finding Detail"
      description="Finding lifecycle and evidence"
      actions={
        <Link
          href="/dashboard/findings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Findings
        </Link>
      }
    >
      <div className="space-y-6">
        {/* -------------------------------------------------------- */}
        {/*  Header                                                    */}
        {/* -------------------------------------------------------- */}
        <GlowCard glow={glowColor} className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold font-mono tracking-tight text-foreground truncate">
                {finding.checkSlug}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground font-mono truncate">
                ID: {finding.id}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Badge variant={sevCfg.variant}>{sevCfg.label}</Badge>
              <span className="inline-flex items-center gap-1.5 rounded-2xl border border-border/40 bg-card/60 px-2.5 py-1 text-xs">
                <FindingStateIcon state={iconState} size={14} />
                {STATUS_LABELS[finding.status]}
              </span>
              {finding.visibility === "MUTED" ? (
                <Badge variant="muted">Muted</Badge>
              ) : (
                <Badge variant="informational">Visible</Badge>
              )}
            </div>
          </div>
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  Core Details                                              */}
        {/* -------------------------------------------------------- */}
        <GlowCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Core Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <DetailRow label="Tenant ID" value={finding.tenantId} mono />
            <DetailRow label="Scope ID" value={finding.scopeId} mono />
            <DetailRow label="First Seen" value={formatDate(finding.firstSeenAt)} />
            <DetailRow label="Last Seen" value={formatDate(finding.lastSeenAt)} />
            <DetailRow label="Created" value={formatDate(finding.createdAt)} />
            <DetailRow label="Updated" value={formatDate(finding.updatedAt)} />
            {finding.assignedTo && (
              <DetailRow label="Assigned To" value={finding.assignedTo} mono />
            )}
            {finding.latestEvidenceId && (
              <DetailRow label="Latest Evidence ID" value={finding.latestEvidenceId} mono />
            )}
            {finding.evidenceDueAt && (
              <DetailRow label="Evidence Due" value={formatDate(finding.evidenceDueAt)} />
            )}
            {finding.acceptanceExpiresAt && (
              <DetailRow
                label="Acceptance Expires"
                value={formatDate(finding.acceptanceExpiresAt)}
              />
            )}
          </div>
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  Lifecycle Timeline                                        */}
        {/* -------------------------------------------------------- */}
        <GlowCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Lifecycle Timeline</h3>
          {timelineEntries.length > 0 ? (
            <div className="divide-y divide-border/30">{timelineEntries}</div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No lifecycle transitions recorded yet. This finding is still in its initial state.
            </p>
          )}
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  Actions                                                   */}
        {/* -------------------------------------------------------- */}
        <GlowCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Actions</h3>
          <div className="flex flex-wrap gap-3">
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<Eye className="h-4 w-4" />}
              disabled
            >
              Acknowledge
            </InteractiveButton>
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<ShieldAlert className="h-4 w-4" />}
              disabled
            >
              Accept Risk
            </InteractiveButton>
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<VolumeX className="h-4 w-4" />}
              disabled
            >
              Mute
            </InteractiveButton>
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<CheckCircle2 className="h-4 w-4" />}
              disabled
            >
              Resolve
            </InteractiveButton>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            State transition actions will be wired to tRPC mutations in a future iteration.
          </p>
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  Notes                                                     */}
        {/* -------------------------------------------------------- */}
        {finding.notes && (
          <GlowCard className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 inline-flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              Notes
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{finding.notes}</p>
          </GlowCard>
        )}
      </div>
    </PageContainer>
  );
}
