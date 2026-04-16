"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Scan, AlertTriangle } from "lucide-react";
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

  /* ---- Pagination state ---- */
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  /* ---- Build query input ---- */
  const queryInput = {
    limit: DEFAULT_PAGE_SIZE,
    cursor,
    ...(statusFilter !== ALL_FILTER && { status: statusFilter }),
  };

  const { data, isLoading, isError, error } =
    trpc.scan.list.useQuery(queryInput);

  const scans = (data?.items ?? []) as unknown as ScanItem[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Reset pagination when filters change ---- */
  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setCursor(undefined);
    setCursorStack([]);
  }, []);

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (s: ScanItem) => router.push(`/dashboard/scans/${s.id}`),
    [router],
  );

  /* ---- Filter controls rendered in the header actions slot ---- */
  const filterControls = (
    <div className="flex items-center gap-3">
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
            hasPrevPage={cursorStack.length > 0}
            onNextPage={() => {
              if (nextCursor) {
                setCursorStack((prev) => [...prev, cursor ?? ""]);
                setCursor(nextCursor);
              }
            }}
            onPrevPage={() => {
              setCursorStack((prev) => {
                const next = [...prev];
                const prevCursor = next.pop();
                setCursor(prevCursor === "" ? undefined : prevCursor);
                return next;
              });
            }}
            isLoading={isLoading}
            className="mt-2"
          />
        </>
      )}
    </PageContainer>
  );
}
