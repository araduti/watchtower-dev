"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Eye, Download } from "lucide-react";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import {
  Badge,
  Button,
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
import { ClientDate } from "@/components/shared/client-date";

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
/*  CSV Export helper                                                   */
/* ------------------------------------------------------------------ */

function exportFindingsCsv(findings: Finding[]) {
  const headers = ["ID", "Check Slug", "Severity", "Status", "Visibility", "Tenant ID", "Scope ID", "First Seen", "Last Seen"];
  const rows = findings.map((f) => [
    f.id,
    f.checkSlug,
    f.severity,
    f.status,
    f.visibility,
    f.tenantId,
    f.scopeId,
    new Date(f.firstSeenAt).toISOString(),
    new Date(f.lastSeenAt).toISOString(),
  ]);

  const csv = [headers, ...rows].map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
  ).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `findings-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

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
      <ClientDate value={f.firstSeenAt} variant="date" className="text-muted-foreground" />
    ),
  },
  {
    key: "lastSeenAt",
    header: "Last Seen",
    render: (f: Finding) => (
      <ClientDate value={f.lastSeenAt} variant="date" className="text-muted-foreground" />
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
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  /* ---- Selection state ---- */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage, reset } = useCursorPagination();

  /* ---- Build query input ---- */
  const queryInput = {
    limit: DEFAULT_PAGE_SIZE,
    cursor,
    ...(severityFilter !== ALL_FILTER && { severity: severityFilter as FindingSeverity }),
    ...(statusFilter !== ALL_FILTER && { status: statusFilter as FindingStatus }),
    ...(dateFrom && !isNaN(new Date(dateFrom).getTime()) && { createdAfter: new Date(dateFrom).toISOString() }),
    ...(dateTo && !isNaN(new Date(dateTo).getTime()) && { createdBefore: new Date(dateTo).toISOString() }),
  };

  const { data, isLoading, isError, error } =
    trpc.finding.list.useQuery(queryInput);

  const findings = (data?.items ?? []) as unknown as Finding[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Bulk mutations ---- */
  const utils = trpc.useUtils();
  const acknowledgeMutation = trpc.finding.acknowledge.useMutation({
    onSuccess: () => utils.finding.list.invalidate(),
  });
  const resolveMutation = trpc.finding.resolve.useMutation({
    onSuccess: () => utils.finding.list.invalidate(),
  });

  const [bulkPending, setBulkPending] = useState(false);

  const handleBulkAcknowledge = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    setBulkPending(true);
    try {
      const promises = Array.from(selectedKeys).map((findingId) =>
        acknowledgeMutation.mutateAsync({
          idempotencyKey: crypto.randomUUID(),
          findingId,
        }),
      );
      await Promise.allSettled(promises);
      setSelectedKeys(new Set());
    } finally {
      setBulkPending(false);
    }
  }, [selectedKeys, acknowledgeMutation]);

  const handleBulkResolve = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    setBulkPending(true);
    try {
      const promises = Array.from(selectedKeys).map((findingId) =>
        resolveMutation.mutateAsync({
          idempotencyKey: crypto.randomUUID(),
          findingId,
        }),
      );
      await Promise.allSettled(promises);
      setSelectedKeys(new Set());
    } finally {
      setBulkPending(false);
    }
  }, [selectedKeys, resolveMutation]);

  /* ---- Reset pagination and selection when filters change ---- */
  const handleSeverityChange = useCallback((value: string) => {
    setSeverityFilter(value);
    setSelectedKeys(new Set());
    reset();
  }, [reset]);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setSelectedKeys(new Set());
    reset();
  }, [reset]);

  const handleDateFromChange = useCallback((value: string) => {
    setDateFrom(value);
    setSelectedKeys(new Set());
    reset();
  }, [reset]);

  const handleDateToChange = useCallback((value: string) => {
    setDateTo(value);
    setSelectedKeys(new Set());
    reset();
  }, [reset]);

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (f: Finding) => router.push(`/dashboard/findings/${f.id}`),
    [router],
  );

  /* ---- Filter controls + bulk actions rendered in the header ---- */
  const headerActions = (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Bulk action bar — only visible when items are selected */}
      {selectedKeys.size > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            {selectedKeys.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={bulkPending}
            onClick={handleBulkAcknowledge}
          >
            <Eye className="mr-1 h-3 w-3" />
            Acknowledge
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={bulkPending}
            onClick={handleBulkResolve}
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Resolve
          </Button>
        </div>
      )}

      {/* CSV export */}
      {findings.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => exportFindingsCsv(findings)}
        >
          <Download className="mr-1 h-3 w-3" />
          Export CSV
        </Button>
      )}

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

      {/* Date range filter */}
      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={handleDateFromChange}
        onDateToChange={handleDateToChange}
      />
    </div>
  );

  return (
    <PageContainer
      title="Findings"
      description="Compliance findings across all tenants"
      actions={headerActions}
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
            selectable
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
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
