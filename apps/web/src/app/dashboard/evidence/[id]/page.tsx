"use client";

import { use, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { LoadingState, EmptyState } from "@/components/shared/empty-loading";
import { ClientDate } from "@/components/shared/client-date";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type EvidenceResult = "PASS" | "FAIL" | "ERROR" | "NOT_APPLICABLE";
type EvidenceType = "AUTOMATED" | "MANUAL" | "HYBRID";
type ReviewStatus = "NOT_REQUIRED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

interface EvidenceDetail {
  id: string;
  workspaceId: string;
  scopeId: string;
  tenantId: string;
  scanId: string;
  findingId: string;
  result: EvidenceResult;
  type: EvidenceType;
  observedAt: string;
  validFrom: string;
  validUntil: string | null;
  collectedBy: string;
  collectedById: string;
  reviewStatus: ReviewStatus;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  url: string | null;
  storageKey: string | null;
  rawEvidence: unknown;
}

/* ------------------------------------------------------------------ */
/*  Result badge config                                                */
/* ------------------------------------------------------------------ */

const RESULT_BADGE: Record<
  EvidenceResult,
  { variant: "default" | "critical" | "high" | "secondary"; label: string }
> = {
  PASS: { variant: "default", label: "Pass" },
  FAIL: { variant: "critical", label: "Fail" },
  ERROR: { variant: "high", label: "Error" },
  NOT_APPLICABLE: { variant: "secondary", label: "N/A" },
} as const;

/* ------------------------------------------------------------------ */
/*  Review status badge config                                         */
/* ------------------------------------------------------------------ */

const REVIEW_BADGE: Record<
  ReviewStatus,
  { variant: "outline" | "secondary" | "default" | "critical"; label: string }
> = {
  NOT_REQUIRED: { variant: "outline", label: "Not Required" },
  PENDING_REVIEW: { variant: "secondary", label: "Pending Review" },
  APPROVED: { variant: "default", label: "Approved" },
  REJECTED: { variant: "critical", label: "Rejected" },
} as const;

/* ------------------------------------------------------------------ */
/*  Type badge config                                                  */
/* ------------------------------------------------------------------ */

const TYPE_BADGE: Record<
  EvidenceType,
  { variant: "outline" | "secondary"; label: string }
> = {
  AUTOMATED: { variant: "outline", label: "Automated" },
  MANUAL: { variant: "secondary", label: "Manual" },
  HYBRID: { variant: "secondary", label: "Hybrid" },
} as const;

/* ------------------------------------------------------------------ */
/*  Glow color by result                                               */
/* ------------------------------------------------------------------ */

const RESULT_GLOW: Record<EvidenceResult, "green" | "red" | "amber" | "none"> = {
  PASS: "green",
  FAIL: "red",
  ERROR: "amber",
  NOT_APPLICABLE: "none",
} as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Truncate an ID to 8 characters for display. */
function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Format file size in human-readable bytes. */
function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

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
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isLoading, isError, error } = trpc.evidence.get.useQuery({
    evidenceId: id,
  });

  const evidence = data as EvidenceDetail | undefined;

  /* ---- Loading ---- */
  if (isLoading) {
    return (
      <PageContainer title="Evidence Detail" description="Loading evidence…">
        <LoadingState rows={6} />
      </PageContainer>
    );
  }

  /* ---- Error ---- */
  if (isError || !evidence) {
    return (
      <PageContainer title="Evidence Detail" description="Compliance evidence detail">
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load evidence"
          description={error?.message ?? "Evidence not found or you do not have access."}
        />
      </PageContainer>
    );
  }

  const resultCfg = RESULT_BADGE[evidence.result];
  const reviewCfg = REVIEW_BADGE[evidence.reviewStatus];
  const typeCfg = TYPE_BADGE[evidence.type];
  const glowColor = RESULT_GLOW[evidence.result];

  return (
    <PageContainer
      title="Evidence Detail"
      description="Compliance evidence detail"
      actions={
        <Link
          href="/dashboard/evidence"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Evidence
        </Link>
      }
    >
      <div className="space-y-6">
        {/* -------------------------------------------------------- */}
        {/*  Metadata                                                  */}
        {/* -------------------------------------------------------- */}
        <GlowCard glow={glowColor} className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Evidence Metadata</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <DetailRow label="Evidence ID" value={evidence.id} mono />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Result</span>
              <div><Badge variant={resultCfg.variant}>{resultCfg.label}</Badge></div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Type</span>
              <div><Badge variant={typeCfg.variant}>{typeCfg.label}</Badge></div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Review Status</span>
              <div><Badge variant={reviewCfg.variant}>{reviewCfg.label}</Badge></div>
            </div>
            <DetailRow label="Observed At" value={<ClientDate value={evidence.observedAt} variant="datetime" />} />
            <DetailRow label="Valid From" value={<ClientDate value={evidence.validFrom} variant="datetime" />} />
            <DetailRow label="Valid Until" value={<ClientDate value={evidence.validUntil} variant="datetime" />} />
            <DetailRow
              label="Collected By"
              value={`${evidence.collectedBy}${evidence.collectedById ? ` · ${truncateId(evidence.collectedById)}` : ""}`}
            />
          </div>
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  Reference Links                                           */}
        {/* -------------------------------------------------------- */}
        <GlowCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">References</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Finding ID</span>
              <Link
                href={`/dashboard/findings/${evidence.findingId}`}
                className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {evidence.findingId}
              </Link>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Scan ID</span>
              <Link
                href={`/dashboard/scans/${evidence.scanId}`}
                className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {evidence.scanId}
              </Link>
            </div>
            <DetailRow label="Tenant ID" value={truncateId(evidence.tenantId)} mono />
          </div>
        </GlowCard>

        {/* -------------------------------------------------------- */}
        {/*  File Info (conditional)                                    */}
        {/* -------------------------------------------------------- */}
        {evidence.fileName && (
          <GlowCard className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">File Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <DetailRow label="File Name" value={evidence.fileName} />
              <DetailRow label="File Size" value={formatFileSize(evidence.fileSize)} mono />
              <DetailRow label="MIME Type" value={evidence.mimeType ?? "—"} mono />
              {evidence.url ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Storage Key</span>
                  <a
                    href={evidence.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {evidence.storageKey ?? "Download"}
                  </a>
                </div>
              ) : evidence.storageKey ? (
                <DetailRow label="Storage Key" value={evidence.storageKey} mono />
              ) : null}
            </div>
          </GlowCard>
        )}

        {/* -------------------------------------------------------- */}
        {/*  Raw Evidence                                              */}
        {/* -------------------------------------------------------- */}
        <GlowCard className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Raw Evidence</h3>

          {evidence.reviewNotes && (
            <div className="mb-4">
              <span className="text-xs text-muted-foreground">Review Notes</span>
              <p className="text-sm text-foreground mt-0.5">{evidence.reviewNotes}</p>
            </div>
          )}

          {evidence.reviewedBy && (
            <div className="mb-4 flex items-center gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Reviewed By</span>
                <p className="font-mono text-sm text-foreground">{truncateId(evidence.reviewedBy)}</p>
              </div>
              {evidence.reviewedAt && (
                <div>
                  <span className="text-xs text-muted-foreground">Reviewed At</span>
                  <p className="text-sm text-foreground"><ClientDate value={evidence.reviewedAt} variant="datetime" /></p>
                </div>
              )}
            </div>
          )}

          <pre className="bg-muted/50 rounded-2xl border border-border/40 p-4 overflow-x-auto font-mono text-xs">
            {evidence.rawEvidence
              ? JSON.stringify(evidence.rawEvidence, null, 2)
              : "No raw evidence data available."}
          </pre>
        </GlowCard>
      </div>
    </PageContainer>
  );
}
