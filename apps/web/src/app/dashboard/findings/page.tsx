"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";
import { FindingStateIcon } from "@/components/shared/status-icon";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

const ALL_FILTER = "__all__" as const;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Local finding shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['finding']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
type FindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type FindingStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "ACCEPTED_RISK"
  | "RESOLVED"
  | "NOT_APPLICABLE";
type FindingVisibility = "DEFAULT" | "MUTED";

interface Finding extends Record<string, unknown> {
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
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Severity badge variant mapping                                     */
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
/*  Status label mapping                                               */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In Progress",
  ACCEPTED_RISK: "Accepted Risk",
  RESOLVED: "Resolved",
  NOT_APPLICABLE: "N/A",
} as const;

/**
 * Maps FindingStatus enum values to FindingStateIcon `state` prop values.
 * FindingStateIcon supports: "open" | "acknowledged" | "muted" | "accepted_risk" | "resolved"
 */
const STATUS_TO_ICON_STATE: Record<FindingStatus, "open" | "acknowledged" | "muted" | "accepted_risk" | "resolved"> = {
  OPEN: "open",
  ACKNOWLEDGED: "acknowledged",
  IN_PROGRESS: "open",
  ACCEPTED_RISK: "accepted_risk",
  RESOLVED: "resolved",
  NOT_APPLICABLE: "resolved",
} as const;

/* ------------------------------------------------------------------ */
/*  Filter options                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_FILTER, label: "All Severities" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "INFO", label: "Info" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_FILTER, label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ACCEPTED_RISK", label: "Accepted Risk" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "NOT_APPLICABLE", label: "N/A" },
];

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "checkSlug",
    header: "Check Slug",
    mono: true,
    render: (f: Finding) => (
      <span className="font-medium text-foreground">{f.checkSlug}</span>
    ),
    minWidth: "220px",
  },
  {
    key: "severity",
    header: "Severity",
    render: (f: Finding) => {
      const cfg = SEVERITY_BADGE[f.severity];
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
  },
  {
    key: "status",
    header: "Status",
    render: (f: Finding) => {
      const iconState = STATUS_TO_ICON_STATE[f.status];
      return (
        <span className="inline-flex items-center gap-1.5">
          <FindingStateIcon state={iconState} size={14} />
          <span className="text-muted-foreground text-xs">
            {STATUS_LABELS[f.status]}
          </span>
        </span>
      );
    },
  },
  {
    key: "visibility",
    header: "Visibility",
    render: (f: Finding) =>
      f.visibility === "MUTED" ? (
        <Badge variant="muted">Muted</Badge>
      ) : (
        <span className="text-muted-foreground text-xs">Default</span>
      ),
  },
  {
    key: "firstSeenAt",
    header: "First Seen",
    render: (f: Finding) => (
      <span className="text-muted-foreground">
        {new Date(f.firstSeenAt).toLocaleDateString()}
      </span>
    ),
  },
  {
    key: "lastSeenAt",
    header: "Last Seen",
    render: (f: Finding) => (
      <span className="text-muted-foreground">
        {new Date(f.lastSeenAt).toLocaleDateString()}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function FindingsPage() {
  const router = useRouter();

  /* ---- Filter state ---- */
  const [severityFilter, setSeverityFilter] = useState<string>(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage, reset } = useCursorPagination();

  /* ---- Build query input ---- */
  const queryInput = {
    limit: DEFAULT_PAGE_SIZE,
    cursor,
    ...(severityFilter !== ALL_FILTER && { severity: severityFilter }),
    ...(statusFilter !== ALL_FILTER && { status: statusFilter }),
  };

  const { data, isLoading, isError, error } =
    trpc.finding.list.useQuery(queryInput);

  const findings = (data?.items ?? []) as unknown as Finding[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Reset pagination when filters change ---- */
  const handleSeverityChange = useCallback((value: string) => {
    setSeverityFilter(value);
    reset();
  }, [reset]);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    reset();
  }, [reset]);

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (f: Finding) => router.push(`/dashboard/findings/${f.id}`),
    [router],
  );

  /* ---- Filter controls rendered in the header actions slot ---- */
  const filterControls = (
    <div className="flex items-center gap-3">
      {/* Severity filter */}
      <Select value={severityFilter} onValueChange={handleSeverityChange}>
        <SelectTrigger className="w-[160px] rounded-2xl border-border/40 bg-card/80 backdrop-blur-md text-xs">
          <SelectValue placeholder="All Severities" />
        </SelectTrigger>
        <SelectContent className="rounded-2xl border-border/40 bg-card backdrop-blur-md">
          {SEVERITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select value={statusFilter} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[160px] rounded-2xl border-border/40 bg-card/80 backdrop-blur-md text-xs">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent className="rounded-2xl border-border/40 bg-card backdrop-blur-md">
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <PageContainer
      title="Findings"
      description="Compliance findings across all tenants"
      actions={filterControls}
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={8} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load findings"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no findings match current filters */}
      {!isLoading && !isError && findings.length === 0 && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" />}
          title="No findings yet"
          description="Findings will appear here after your first scan completes. Trigger a scan from the Scans page to begin."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && findings.length > 0 && (
        <>
          <DataTable<Finding>
            columns={columns}
            data={findings}
            getKey={(f) => f.id}
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
