"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Scan, AlertTriangle, Play } from "lucide-react";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { InteractiveButton } from "@/components/shared/interactive-button";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";
import { ScanStatusIcon } from "@/components/shared/status-icon";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

const ALL_FILTER = "__all__" as const;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ScanStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type ScanTrigger = "MANUAL" | "SCHEDULED" | "WEBHOOK" | "API";

/**
 * Local scan shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['scan']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
interface ScanItem extends Record<string, unknown> {
  id: string;
  workspaceId: string;
  scopeId: string;
  tenantId: string;
  triggeredBy: ScanTrigger;
  triggeredByUserId: string | null;
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  checksRun: number;
  checksFailed: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Status → ScanStatusIcon mapping                                    */
/* ------------------------------------------------------------------ */

/**
 * ScanStatusIcon accepts "COMPLETED" instead of "SUCCEEDED".
 * Map here to keep the boundary clean.
 */
const STATUS_TO_ICON: Record<
  ScanStatus,
  "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED"
> = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

const STATUS_LABELS: Record<ScanStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
} as const;

/* ------------------------------------------------------------------ */
/*  Trigger badge variant mapping                                      */
/* ------------------------------------------------------------------ */

const TRIGGER_BADGE: Record<
  ScanTrigger,
  { variant: "secondary" | "outline"; label: string }
> = {
  MANUAL: { variant: "secondary", label: "Manual" },
  SCHEDULED: { variant: "outline", label: "Scheduled" },
  WEBHOOK: { variant: "outline", label: "Webhook" },
  API: { variant: "outline", label: "API" },
} as const;

/* ------------------------------------------------------------------ */
/*  Filter options                                                     */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_FILTER, label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "RUNNING", label: "Running" },
  { value: "SUCCEEDED", label: "Succeeded" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_FILTER, label: "All Triggers" },
  { value: "MANUAL", label: "Manual" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "WEBHOOK", label: "Webhook" },
  { value: "API", label: "API" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string | null, finishedAt: string | null, status: ScanStatus): string {
  if (!startedAt) return "—";
  if (!finishedAt) {
    return status === "RUNNING" ? "In progress" : "—";
  }

  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "—";

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function truncateId(id: string, length = 8): string {
  if (id.length <= length) return id;
  return `${id.slice(0, length)}…`;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "tenantId",
    header: "Tenant ID",
    mono: true,
    render: (s: ScanItem) => (
      <span className="text-muted-foreground" title={s.tenantId}>
        {truncateId(s.tenantId)}
      </span>
    ),
    minWidth: "120px",
  },
  {
    key: "status",
    header: "Status",
    render: (s: ScanItem) => (
      <span className="inline-flex items-center gap-1.5">
        <ScanStatusIcon status={STATUS_TO_ICON[s.status]} size={14} />
        <span className="text-muted-foreground text-xs">
          {STATUS_LABELS[s.status]}
        </span>
      </span>
    ),
  },
  {
    key: "triggeredBy",
    header: "Triggered By",
    render: (s: ScanItem) => {
      const cfg = TRIGGER_BADGE[s.triggeredBy];
      return (
        <Badge variant={cfg.variant} className="text-[11px]">
          {cfg.label}
        </Badge>
      );
    },
  },
  {
    key: "checksRun",
    header: "Checks Run",
    align: "right" as const,
    mono: true,
    render: (s: ScanItem) => (
      <span className="text-muted-foreground">{s.checksRun}</span>
    ),
  },
  {
    key: "checksFailed",
    header: "Checks Failed",
    align: "right" as const,
    mono: true,
    render: (s: ScanItem) => (
      <span className={s.checksFailed > 0 ? "text-red-400 font-semibold" : "text-muted-foreground"}>
        {s.checksFailed}
      </span>
    ),
  },
  {
    key: "startedAt",
    header: "Started At",
    render: (s: ScanItem) => (
      <span className="text-muted-foreground">
        {s.startedAt ? formatDateTime(s.startedAt) : "—"}
      </span>
    ),
    minWidth: "160px",
  },
  {
    key: "duration",
    header: "Duration",
    mono: true,
    render: (s: ScanItem) => {
      const label = formatDuration(s.startedAt, s.finishedAt, s.status);
      return (
        <span className={label === "In progress" ? "text-blue-400" : "text-muted-foreground"}>
          {label}
        </span>
      );
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function ScansPage() {
  const router = useRouter();

  /* ---- Filter state ---- */
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  const [triggerFilter, setTriggerFilter] = useState<string>(ALL_FILTER);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage, reset } = useCursorPagination();

  /* ---- Build query input ---- */
  const queryInput = {
    limit: DEFAULT_PAGE_SIZE,
    cursor,
    ...(statusFilter !== ALL_FILTER && { status: statusFilter as ScanStatus }),
    ...(triggerFilter !== ALL_FILTER && { triggeredBy: triggerFilter as ScanTrigger }),
    ...(dateFrom && !isNaN(new Date(dateFrom).getTime()) && { createdAfter: new Date(dateFrom).toISOString() }),
    ...(dateTo && !isNaN(new Date(dateTo).getTime()) && { createdBefore: new Date(dateTo).toISOString() }),
  };

  const { data, isLoading, isError, error } =
    trpc.scan.list.useQuery(queryInput);

  const scans = (data?.items ?? []) as unknown as ScanItem[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Tenant list for trigger dialog ---- */
  const { data: tenantData } = trpc.tenant.list.useQuery({ limit: 100 });
  const tenants = tenantData?.items ?? [];

  /* ---- Trigger scan mutation ---- */
  const utils = trpc.useUtils();
  const triggerMutation = trpc.scan.trigger.useMutation({
    onSuccess: (scan) => {
      utils.scan.list.invalidate();
      setTriggerOpen(false);
      setSelectedTenantId("");
      router.push(`/dashboard/scans/${scan.id}`);
    },
  });

  /* ---- Reset pagination when filters change ---- */
  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    reset();
  }, [reset]);

  const handleTriggerChange = useCallback((value: string) => {
    setTriggerFilter(value);
    reset();
  }, [reset]);

  const handleDateFromChange = useCallback((value: string) => {
    setDateFrom(value);
    reset();
  }, [reset]);

  const handleDateToChange = useCallback((value: string) => {
    setDateTo(value);
    reset();
  }, [reset]);

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (s: ScanItem) => router.push(`/dashboard/scans/${s.id}`),
    [router],
  );

  /* ---- Filter controls rendered in the header actions slot ---- */
  const filterControls = (
    <div className="flex items-center gap-3">
      <InteractiveButton
        icon={<Play className="h-4 w-4" />}
        onClick={() => setTriggerOpen(true)}
        size="sm"
      >
        Trigger Scan
      </InteractiveButton>
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
      <Select value={triggerFilter} onValueChange={handleTriggerChange}>
        <SelectTrigger className="w-[160px] rounded-2xl border-border/40 bg-card/80 backdrop-blur-md text-xs">
          <SelectValue placeholder="All Triggers" />
        </SelectTrigger>
        <SelectContent className="rounded-2xl border-border/40 bg-card backdrop-blur-md">
          {TRIGGER_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      title="Scans"
      description="Compliance scan history and triggers"
      actions={filterControls}
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={8} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load scans"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no scans match current filters */}
      {!isLoading && !isError && scans.length === 0 && (
        <EmptyState
          icon={<Scan className="h-10 w-10" />}
          title="No scans yet"
          description="Trigger your first compliance scan to audit your M365 tenants against CIS and NIST frameworks."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && scans.length > 0 && (
        <>
          <DataTable<ScanItem>
            columns={columns}
            data={scans}
            getKey={(s) => s.id}
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
      {/* Trigger Scan Dialog */}
      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trigger Scan</DialogTitle>
            <DialogDescription>
              Select a tenant to run a compliance scan against.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tenant…" />
              </SelectTrigger>
              <SelectContent>
                {(tenants as Array<{ id: string; displayName: string }>).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {triggerMutation.error && (
              <p className="mt-3 text-sm text-red-400">{triggerMutation.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTriggerOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedTenantId || triggerMutation.isPending}
              onClick={() => triggerMutation.mutate({
                idempotencyKey: crypto.randomUUID(),
                tenantId: selectedTenantId,
              })}
            >
              {triggerMutation.isPending ? "Triggering…" : "Trigger Scan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
