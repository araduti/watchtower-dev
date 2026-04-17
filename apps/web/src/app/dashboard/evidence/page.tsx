"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileSearch } from "lucide-react";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Local evidence shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['evidence']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
type EvidenceResult = "PASS" | "FAIL" | "ERROR" | "NOT_APPLICABLE";
type EvidenceType = "AUTOMATED" | "MANUAL" | "HYBRID";
type ReviewStatus = "NOT_REQUIRED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

interface EvidenceItem extends Record<string, unknown> {
  id: string;
  workspaceId: string;
  scopeId: string;
  tenantId: string;
  scanId: string;
  findingId: string;
  result: EvidenceResult;
  type: EvidenceType;
  observedAt: string;
  reviewStatus: ReviewStatus;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
}

/* ------------------------------------------------------------------ */
/*  Result badge variant mapping                                       */
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
/*  Review status badge variant mapping                                */
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
/*  Type badge variant mapping                                         */
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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Truncate an ID to 8 characters for display. */
function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "result",
    header: "Result",
    render: (e: EvidenceItem) => {
      const cfg = RESULT_BADGE[e.result];
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
  },
  {
    key: "type",
    header: "Type",
    render: (e: EvidenceItem) => {
      const cfg = TYPE_BADGE[e.type];
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
  },
  {
    key: "findingId",
    header: "Finding ID",
    mono: true,
    render: (e: EvidenceItem) => (
      <span className="text-muted-foreground" title={e.findingId}>
        {truncateId(e.findingId)}
      </span>
    ),
    minWidth: "120px",
  },
  {
    key: "scanId",
    header: "Scan ID",
    mono: true,
    render: (e: EvidenceItem) => (
      <span className="text-muted-foreground" title={e.scanId}>
        {truncateId(e.scanId)}
      </span>
    ),
    minWidth: "120px",
  },
  {
    key: "reviewStatus",
    header: "Review Status",
    render: (e: EvidenceItem) => {
      const cfg = REVIEW_BADGE[e.reviewStatus];
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
  },
  {
    key: "observedAt",
    header: "Observed At",
    render: (e: EvidenceItem) => (
      <span className="text-muted-foreground">
        {new Date(e.observedAt).toLocaleDateString()}
      </span>
    ),
    minWidth: "120px",
  },
  {
    key: "fileName",
    header: "File Name",
    render: (e: EvidenceItem) => (
      <span className="text-muted-foreground text-xs">
        {e.fileName ?? "—"}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function EvidencePage() {
  const router = useRouter();

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } = useCursorPagination();

  /* ---- Build query input ---- */
  const queryInput = {
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  };

  const { data, isLoading, isError, error } =
    trpc.evidence.list.useQuery(queryInput);

  const evidence = (data?.items ?? []) as unknown as EvidenceItem[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (e: EvidenceItem) => router.push(`/dashboard/evidence/${e.id}`),
    [router],
  );

  return (
    <PageContainer
      title="Evidence"
      description="Compliance evidence collected during scans"
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={8} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load evidence"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no evidence matches current filters */}
      {!isLoading && !isError && evidence.length === 0 && (
        <EmptyState
          icon={<FileSearch className="h-10 w-10" />}
          title="No evidence yet"
          description="Evidence will appear here after your first scan completes. Trigger a scan from the Scans page to begin."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && evidence.length > 0 && (
        <>
          <DataTable<EvidenceItem>
            columns={columns}
            data={evidence}
            getKey={(e) => e.id}
            onRowClick={handleRowClick}
          />
          <CursorPagination
            hasNextPage={nextCursor !== null}
            hasPrevPage={hasPrevPage}
            onNextPage={() => { if (nextCursor) goToNextPage(nextCursor); }}
            onPrevPage={goToPrevPage}
            isLoading={isLoading}
            className="mt-2"
          />
        </>
      )}
    </PageContainer>
  );
}
