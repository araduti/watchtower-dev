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
  BookOpen,
  Wrench,
  Database,
  ChevronDown,
  ChevronRight,
  Info,
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

interface RawEvidence {
  pass?: boolean;
  warnings?: string[];
  actualValues?: Record<string, unknown>;
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
/*  Evidence result color                                              */
/* ------------------------------------------------------------------ */

const EVIDENCE_RESULT_STYLE: Record<string, { color: string; label: string }> = {
  PASS: { color: "text-emerald-400", label: "Pass" },
  FAIL: { color: "text-red-400", label: "Fail" },
  ERROR: { color: "text-amber-400", label: "Error" },
  NOT_APPLICABLE: { color: "text-muted-foreground", label: "N/A" },
};

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
/*  Collapsible raw data panel                                         */
/* ------------------------------------------------------------------ */

function CollapsibleJson({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded-xl bg-muted/20 border border-border/30 p-3 text-xs font-mono text-muted-foreground leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Simple markdown renderer (bold, inline-code, bullets, newlines)   */
/* ------------------------------------------------------------------ */

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={key} className="mt-1.5 mb-2 space-y-1 pl-4">
          {listBuffer.map((item, i) => (
            <li key={i} className="text-sm text-muted-foreground list-disc">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList(`list-${idx}`);
      if (!trimmed) {
        elements.push(<div key={idx} className="h-2" />);
      } else if (trimmed.startsWith("### ")) {
        elements.push(
          <p key={idx} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">
            {trimmed.slice(4)}
          </p>,
        );
      } else if (trimmed.startsWith("## ")) {
        elements.push(
          <p key={idx} className="text-sm font-semibold text-foreground mt-3 mb-1">
            {trimmed.slice(3)}
          </p>,
        );
      } else {
        elements.push(
          <p key={idx} className="text-sm text-muted-foreground">
            <InlineMarkdown text={trimmed} />
          </p>,
        );
      }
    }
  });

  flushList("list-final");
  return <div className="space-y-0.5">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold** and `code` inline
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded px-1 py-0.5 bg-muted/30 font-mono text-xs text-foreground">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
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

  // Fetch check metadata + framework mapping once we have the checkSlug
  const { data: checkData } = trpc.check.getBySlug.useQuery(
    { slug: finding?.checkSlug ?? "" },
    { enabled: !!finding?.checkSlug },
  );

  // Fetch evidence detail once we have the evidenceId
  const { data: evidenceData } = trpc.evidence.get.useQuery(
    { evidenceId: finding?.latestEvidenceId ?? "" },
    { enabled: !!finding?.latestEvidenceId },
  );

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

  // Parse rawEvidence safely
  const rawEv = evidenceData?.rawEvidence as RawEvidence | null | undefined;
  const warnings: string[] = rawEv?.warnings ?? [];
  const actualValues: Record<string, unknown> = rawEv?.actualValues ?? {};
  const hasFailureDetail = warnings.length > 0 || Object.keys(actualValues).length > 0;

  const evResultStyle = evidenceData
    ? (EVIDENCE_RESULT_STYLE[evidenceData.result] ?? EVIDENCE_RESULT_STYLE["ERROR"])
    : null;

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
        {/*  Header — slug, title, badges                             */}
        {/* -------------------------------------------------------- */}
        <GlowCard glow={glowColor} className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              {/* Human-readable title when check data is available */}
              {checkData?.title && (
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  {checkData.product ?? "Check"}
                </p>
              )}
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {checkData?.title ?? finding.checkSlug}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground font-mono truncate">
                {finding.checkSlug}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground font-mono truncate">
                ID: {finding.id}
              </p>
              {/* Framework coverage badges */}
              {checkData?.frameworks && checkData.frameworks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {checkData.frameworks.map((f) => (
                    <span
                      key={`${f.framework.id}-${f.controlId}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/5 px-2 py-0.5 text-[10px] font-mono text-blue-400/80"
                    >
                      {f.framework.publisher} {f.framework.version}
                      <span className="text-blue-500/40">·</span>
                      {f.controlId}
                      {f.classification && (
                        <span className="ml-0.5 text-blue-500/50">{f.classification}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
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
        {/*  Check description + data source context                  */}
        {/* -------------------------------------------------------- */}
        {checkData && (
          <GlowCard className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 inline-flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              About This Check
            </h3>
            <div className="space-y-4">
              {checkData.description && checkData.description !== checkData.title && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {checkData.description}
                </p>
              )}
              {checkData.rationale && checkData.rationale.trim() && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/70 mb-1">Why it matters</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{checkData.rationale}</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {checkData.product && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Product</span>
                    <span className="text-xs font-mono text-foreground bg-muted/20 rounded-lg px-2 py-1 w-fit">
                      {checkData.product}
                    </span>
                  </div>
                )}
                {checkData.dataSource && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Data Source</span>
                    <span className="text-xs font-mono text-foreground bg-muted/20 rounded-lg px-2 py-1 w-fit">
                      {checkData.dataSource}
                    </span>
                  </div>
                )}
                {checkData.property && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Property</span>
                    <span className="text-xs font-mono text-foreground bg-muted/20 rounded-lg px-2 py-1 w-fit">
                      {checkData.property}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </GlowCard>
        )}

        {/* -------------------------------------------------------- */}
        {/*  What We Found — always visible, evidence when available   */}
        {/* -------------------------------------------------------- */}
        <GlowCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              What We Found
            </h3>
            {evidenceData && (
              <div className="flex items-center gap-2">
                {evResultStyle && (
                  <span className={`text-xs font-mono font-semibold ${evResultStyle.color}`}>
                    {evResultStyle.label}
                  </span>
                )}
                <span className="text-border/40">·</span>
                <ClientDate
                  value={new Date(evidenceData.observedAt).toISOString()}
                  variant="datetime"
                  className="text-xs text-muted-foreground font-mono"
                />
              </div>
            )}
          </div>

          {evidenceData ? (
            hasFailureDetail ? (
              <div className="space-y-4">
                {/* Engine warnings — most human-readable */}
                {warnings.length > 0 && (
                  <div className="space-y-2">
                    {warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 rounded-xl border border-red-500/15 bg-red-500/5 px-3 py-2.5"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-red-300/90 leading-relaxed">{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actual observed values */}
                {Object.keys(actualValues).length > 0 && (
                  <div className="rounded-xl border border-border/30 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30 bg-muted/10">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Property</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Observed Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {Object.entries(actualValues).map(([key, val]) => (
                          <tr key={key}>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{key}</td>
                            <td className="px-3 py-2 font-mono text-foreground">
                              {val === null || val === undefined
                                ? <span className="text-muted-foreground/50 italic">null</span>
                                : typeof val === "object"
                                  ? <span className="text-muted-foreground">{JSON.stringify(val)}</span>
                                  : String(val)
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <CollapsibleJson label="Raw evidence data" data={rawEv} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Evidence was collected but contained no detailed failure data.
              </p>
            )
          ) : (
            /* No evidence yet — show check-derived context as a placeholder */
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span className="text-sm text-amber-300/80">
                  No evidence collected yet. Run a scan to populate failure detail.
                </span>
              </div>
              {(checkData?.dataSource || checkData?.property) && (
                <div className="rounded-xl border border-border/30 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/10">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">What will be checked</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-3 py-2 font-mono text-foreground">{checkData.property ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{checkData.dataSource ?? "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  How to Fix — always visible                              */}
        {/* -------------------------------------------------------- */}
        <GlowCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 inline-flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            How to Fix
          </h3>
          {checkData?.remediation && checkData.remediation.trim() ? (
            <>
              <SimpleMarkdown text={checkData.remediation} />
              {checkData.connectors.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2">Required admin access</p>
                  <div className="flex flex-wrap gap-1.5">
                    {checkData.connectors.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded-lg border border-border/30 bg-muted/10 px-2 py-0.5 text-xs font-mono text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No remediation guidance has been authored for this check yet.
            </p>
          )}
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  Framework coverage — full control detail                 */}
        {/* -------------------------------------------------------- */}
        {checkData?.frameworks && checkData.frameworks.length > 0 && (
          <GlowCard className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Compliance Framework Coverage
            </h3>
            <div className="space-y-2">
              {checkData.frameworks.map((f) => (
                <div
                  key={`${f.framework.id}-${f.controlId}`}
                  className="flex items-center justify-between rounded-xl border border-border/25 bg-muted/5 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{f.framework.name}</span>
                    {f.classification && (
                      <span className="rounded-md border border-border/30 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {f.classification}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-blue-400/80 shrink-0 ml-4">
                    {f.controlId}
                  </span>
                </div>
              ))}
            </div>
          </GlowCard>
        )}

        {/* -------------------------------------------------------- */}
        {/*  Bottom row — Core Details | Lifecycle | Actions           */}
        {/*  Three-column on desktop, stacked on mobile                */}
        {/* -------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Core Details */}
          <GlowCard className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Core Details</h3>
            <div className="space-y-3">
              <DetailRow label="Tenant ID" value={finding.tenantId} mono />
              <DetailRow label="Scope ID" value={finding.scopeId} mono />
              <DetailRow label="First Seen" value={<ClientDate value={finding.firstSeenAt} variant="datetime" />} />
              <DetailRow label="Last Seen" value={<ClientDate value={finding.lastSeenAt} variant="datetime" />} />
              {finding.assignedTo && (
                <DetailRow label="Assigned To" value={finding.assignedTo} mono />
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

          {/* Lifecycle Timeline */}
          <GlowCard className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Lifecycle</h3>
            {timelineEntries.length > 0 ? (
              <div className="divide-y divide-border/30">{timelineEntries}</div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No transitions yet. Finding is in its initial state.
              </p>
            )}
          </GlowCard>

          {/* Actions */}
          <GlowCard className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Actions</h3>
            {feedback && (
              <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}>
                {feedback.message}
              </div>
            )}
            <div className="flex flex-col gap-2">
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

        </div>

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
