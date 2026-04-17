"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";
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
 * Local check shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['check']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
type CheckSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type CheckSource = "BUILTIN" | "PLUGIN";

interface Check extends Record<string, unknown> {
  id: string;
  slug: string;
  version: number;
  title: string;
  description: string;
  severity: CheckSeverity;
  severityRank: number;
  source: CheckSource;
  product: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Severity badge variant mapping                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_BADGE: Record<
  CheckSeverity,
  { variant: "critical" | "high" | "medium" | "low" | "informational"; label: string }
> = {
  CRITICAL: { variant: "critical", label: "Critical" },
  HIGH: { variant: "high", label: "High" },
  MEDIUM: { variant: "medium", label: "Medium" },
  LOW: { variant: "low", label: "Low" },
  INFO: { variant: "informational", label: "Info" },
} as const;

/* ------------------------------------------------------------------ */
/*  Source badge variant mapping                                       */
/* ------------------------------------------------------------------ */

const SOURCE_BADGE: Record<
  CheckSource,
  { variant: "secondary" | "outline"; label: string }
> = {
  BUILTIN: { variant: "secondary", label: "Built-in" },
  PLUGIN: { variant: "outline", label: "Plugin" },
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

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_FILTER, label: "All Sources" },
  { value: "BUILTIN", label: "Built-in" },
  { value: "PLUGIN", label: "Plugin" },
];

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "slug",
    header: "Slug",
    mono: true,
    render: (c: Check) => (
      <Badge variant="secondary" className="font-mono text-xs">
        {c.slug}
      </Badge>
    ),
    minWidth: "220px",
  },
  {
    key: "title",
    header: "Title",
    render: (c: Check) => (
      <span className="font-medium text-foreground">{c.title}</span>
    ),
    minWidth: "200px",
  },
  {
    key: "severity",
    header: "Severity",
    render: (c: Check) => {
      const cfg = SEVERITY_BADGE[c.severity];
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
  },
  {
    key: "source",
    header: "Source",
    render: (c: Check) => {
      const cfg = SOURCE_BADGE[c.source];
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
  },
  {
    key: "product",
    header: "Product",
    render: (c: Check) => (
      <span className="text-muted-foreground">
        {c.product ?? "—"}
      </span>
    ),
  },
  {
    key: "createdAt",
    header: "Added",
    render: (c: Check) => (
      <ClientDate value={c.createdAt} variant="date" className="text-muted-foreground" />
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function ChecksPage() {
  const router = useRouter();

  /* ---- Filter state ---- */
  const [severityFilter, setSeverityFilter] = useState<string>(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL_FILTER);

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage, reset } = useCursorPagination();

  /* ---- Build query input ---- */
  const queryInput = {
    limit: DEFAULT_PAGE_SIZE,
    cursor,
    ...(severityFilter !== ALL_FILTER && {
      severity: severityFilter as CheckSeverity,
    }),
    ...(sourceFilter !== ALL_FILTER && {
      source: sourceFilter as CheckSource,
    }),
  };

  const { data, isLoading, isError, error } =
    trpc.check.list.useQuery(queryInput);

  const checks = (data?.items ?? []) as unknown as Check[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Reset pagination when filters change ---- */
  const handleSeverityChange = useCallback((value: string) => {
    setSeverityFilter(value);
    reset();
  }, [reset]);

  const handleSourceChange = useCallback((value: string) => {
    setSourceFilter(value);
    reset();
  }, [reset]);

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (c: Check) => router.push(`/dashboard/checks/${c.id}`),
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

      {/* Source filter */}
      <Select value={sourceFilter} onValueChange={handleSourceChange}>
        <SelectTrigger className="w-[160px] rounded-2xl border-border/40 bg-card/80 backdrop-blur-md text-xs">
          <SelectValue placeholder="All Sources" />
        </SelectTrigger>
        <SelectContent className="rounded-2xl border-border/40 bg-card backdrop-blur-md">
          {SOURCE_OPTIONS.map((opt) => (
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
      title="Checks"
      description="Global compliance check catalog (CIS / NIST)"
      actions={filterControls}
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={8} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load checks"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no checks match current filters */}
      {!isLoading && !isError && checks.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10" />}
          title="No checks found"
          description="Compliance checks will appear here once loaded. Adjust your filters or check back later."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && checks.length > 0 && (
        <>
          <DataTable<Check>
            columns={columns}
            data={checks}
            getKey={(c) => c.id}
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
