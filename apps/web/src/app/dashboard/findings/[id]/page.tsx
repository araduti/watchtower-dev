"use client";

import { use, useState, type ReactNode } from "react";
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
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Button,
} from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { LoadingState, EmptyState } from "@/components/shared/empty-loading";
import { FindingStateIcon } from "@/components/shared/status-icon";
import { InteractiveButton } from "@/components/shared/interactive-button";
import { ClientDate } from "@/components/shared/client-date";

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
/*  Detail row                                                         */
/* ------------------------------------------------------------------ */

function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
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
  icon: ReactNode;
  label: string;
  actor: string | null;
  timestamp: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <ClientDate value={timestamp} variant="datetime" className="text-xs text-muted-foreground font-mono" />
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

  const utils = trpc.useUtils();
  const { data, isLoading, isError, error } = trpc.finding.get.useQuery({
    findingId: id,
  });

  const finding = data as FindingDetail | undefined;

  /* ---- Mutation state ---- */
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [muteOpen, setMuteOpen] = useState(false);
  const [muteReason, setMuteReason] = useState("");
  const [muteUntil, setMuteUntil] = useState("");
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptReason, setAcceptReason] = useState("");
  const [acceptExpiry, setAcceptExpiry] = useState("");

  const invalidate = () => {
    utils.finding.get.invalidate({ findingId: id });
    utils.finding.list.invalidate();
  };

  const acknowledgeMutation = trpc.finding.acknowledge.useMutation({
    onSuccess: () => { invalidate(); setFeedback({ type: "success", message: "Finding acknowledged." }); },
    onError: (e) => setFeedback({ type: "error", message: e.message }),
  });

  const resolveMutation = trpc.finding.resolve.useMutation({
    onSuccess: () => { invalidate(); setFeedback({ type: "success", message: "Finding resolved." }); },
    onError: (e) => setFeedback({ type: "error", message: e.message }),
  });

  const muteMutation = trpc.finding.mute.useMutation({
    onSuccess: () => { invalidate(); setMuteOpen(false); setFeedback({ type: "success", message: "Finding muted." }); },
    onError: (e) => setFeedback({ type: "error", message: e.message }),
  });

  const acceptRiskMutation = trpc.finding.acceptRisk.useMutation({
    onSuccess: () => { invalidate(); setAcceptOpen(false); setFeedback({ type: "success", message: "Risk accepted." }); },
    onError: (e) => setFeedback({ type: "error", message: e.message }),
  });

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
  const timelineEntries: ReactNode[] = [];

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
        detail={finding.mutedUntil ? <>Until <ClientDate value={finding.mutedUntil} variant="datetime" /></> : null}
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
            <DetailRow label="First Seen" value={<ClientDate value={finding.firstSeenAt} variant="datetime" />} />
            <DetailRow label="Last Seen" value={<ClientDate value={finding.lastSeenAt} variant="datetime" />} />
            <DetailRow label="Created" value={<ClientDate value={finding.createdAt} variant="datetime" />} />
            <DetailRow label="Updated" value={<ClientDate value={finding.updatedAt} variant="datetime" />} />
            {finding.assignedTo && (
              <DetailRow label="Assigned To" value={finding.assignedTo} mono />
            )}
            {finding.latestEvidenceId && (
              <DetailRow label="Latest Evidence ID" value={finding.latestEvidenceId} mono />
            )}
            {finding.evidenceDueAt && (
              <DetailRow label="Evidence Due" value={<ClientDate value={finding.evidenceDueAt} variant="datetime" />} />
            )}
            {finding.acceptanceExpiresAt && (
              <DetailRow
                label="Acceptance Expires"
                value={<ClientDate value={finding.acceptanceExpiresAt} variant="datetime" />}
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
          {feedback && (
            <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
              feedback.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              {feedback.message}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<Eye className="h-4 w-4" />}
              disabled={finding.status !== "OPEN"}
              loading={acknowledgeMutation.isPending}
              loadingText="Acknowledging…"
              onClick={() => acknowledgeMutation.mutate({
                idempotencyKey: crypto.randomUUID(),
                findingId: finding.id,
              })}
            >
              Acknowledge
            </InteractiveButton>
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<ShieldAlert className="h-4 w-4" />}
              disabled={finding.status !== "OPEN" && finding.status !== "ACKNOWLEDGED"}
              onClick={() => setAcceptOpen(true)}
            >
              Accept Risk
            </InteractiveButton>
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<VolumeX className="h-4 w-4" />}
              disabled={finding.visibility === "MUTED"}
              onClick={() => setMuteOpen(true)}
            >
              Mute
            </InteractiveButton>
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<CheckCircle2 className="h-4 w-4" />}
              disabled={finding.status === "RESOLVED" || finding.status === "NOT_APPLICABLE"}
              loading={resolveMutation.isPending}
              loadingText="Resolving…"
              onClick={() => resolveMutation.mutate({
                idempotencyKey: crypto.randomUUID(),
                findingId: finding.id,
              })}
            >
              Resolve
            </InteractiveButton>
          </div>
        </GlowCard>

        {/* Accept Risk Dialog */}
        <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Accept Risk</DialogTitle>
              <DialogDescription>
                Provide a reason and expiry date for accepting this risk.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="accept-reason" className="text-sm font-medium">Reason</label>
                <Input
                  id="accept-reason"
                  placeholder="Why is this risk acceptable?"
                  value={acceptReason}
                  onChange={(e) => setAcceptReason(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="accept-expiry" className="text-sm font-medium">Expires At</label>
                <Input
                  id="accept-expiry"
                  type="date"
                  value={acceptExpiry}
                  onChange={(e) => setAcceptExpiry(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAcceptOpen(false)}>Cancel</Button>
              <Button
                disabled={!acceptReason || !acceptExpiry || acceptRiskMutation.isPending}
                onClick={() => acceptRiskMutation.mutate({
                  idempotencyKey: crypto.randomUUID(),
                  findingId: finding.id,
                  reason: acceptReason,
                  acceptanceExpiresAt: new Date(acceptExpiry),
                })}
              >
                {acceptRiskMutation.isPending ? "Submitting…" : "Accept Risk"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mute Dialog */}
        <Dialog open={muteOpen} onOpenChange={setMuteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mute Finding</DialogTitle>
              <DialogDescription>
                Optionally provide a reason and expiry for muting this finding.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mute-reason" className="text-sm font-medium">Reason (optional)</label>
                <Input
                  id="mute-reason"
                  placeholder="Why mute this finding?"
                  value={muteReason}
                  onChange={(e) => setMuteReason(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mute-until" className="text-sm font-medium">Mute Until (optional)</label>
                <Input
                  id="mute-until"
                  type="date"
                  value={muteUntil}
                  onChange={(e) => setMuteUntil(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMuteOpen(false)}>Cancel</Button>
              <Button
                disabled={muteMutation.isPending}
                onClick={() => muteMutation.mutate({
                  idempotencyKey: crypto.randomUUID(),
                  findingId: finding.id,
                  ...(muteReason ? { reason: muteReason } : {}),
                  ...(muteUntil ? { mutedUntil: new Date(muteUntil) } : {}),
                })}
              >
                {muteMutation.isPending ? "Muting…" : "Mute"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
