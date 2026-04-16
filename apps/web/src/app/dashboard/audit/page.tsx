"use client";

import { useState } from "react";
import { AlertTriangle, ScrollText } from "lucide-react";
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
 * Local audit entry shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['audit']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
type ActorType = "USER" | "SYSTEM" | "API_TOKEN" | "PLUGIN";

interface AuditEntry extends Record<string, unknown> {
  id: string;
  workspaceId: string;
  scopeId: string | null;
  eventType: string;
  actorType: ActorType;
  actorId: string;
  targetType: string;
  targetId: string;
  eventData: unknown;
  chainSequence: number;
  occurredAt: string;
  recordedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Actor badge variant mapping                                        */
/* ------------------------------------------------------------------ */

const ACTOR_BADGE: Record<
  ActorType,
  { variant: "default" | "secondary" | "outline"; label: string }
> = {
  USER: { variant: "default", label: "User" },
  SYSTEM: { variant: "secondary", label: "System" },
  API_TOKEN: { variant: "outline", label: "API Token" },
  PLUGIN: { variant: "outline", label: "Plugin" },
} as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Truncate an ID to 8 characters for display. */
function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Format a date string to a readable date and time. */
function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "chainSequence",
    header: "#",
    mono: true,
    align: "right" as const,
    minWidth: "60px",
    render: (e: AuditEntry) => (
      <span className="text-muted-foreground">{e.chainSequence}</span>
    ),
  },
  {
    key: "eventType",
    header: "Event Type",
    minWidth: "180px",
    render: (e: AuditEntry) => (
      <Badge variant="secondary" className="font-mono text-xs">
        {e.eventType}
      </Badge>
    ),
  },
  {
    key: "actorType",
    header: "Actor",
    minWidth: "140px",
    render: (e: AuditEntry) => {
      const cfg = ACTOR_BADGE[e.actorType];
      return (
        <span className="inline-flex items-center gap-2">
          <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
            {cfg.label}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {truncateId(e.actorId)}
          </span>
        </span>
      );
    },
  },
  {
    key: "targetType",
    header: "Target",
    minWidth: "160px",
    render: (e: AuditEntry) => (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{e.targetType}</span>
        <span className="font-mono text-xs text-muted-foreground/70">
          {truncateId(e.targetId)}
        </span>
      </span>
    ),
  },
  {
    key: "occurredAt",
    header: "Occurred At",
    minWidth: "200px",
    render: (e: AuditEntry) => (
      <span className="text-xs text-muted-foreground">
        {formatDateTime(e.occurredAt)}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function AuditLogPage() {
  /* ---- Pagination state ---- */
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { data, isLoading, isError, error } = trpc.audit.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const entries = (data?.items ?? []) as unknown as AuditEntry[];
  const nextCursor = data?.nextCursor ?? null;

  return (
    <PageContainer
      title="Audit Log"
      description="Tamper-evident, chain-ordered activity log"
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={8} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load audit log"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no audit entries */}
      {!isLoading && !isError && entries.length === 0 && (
        <EmptyState
          icon={<ScrollText className="h-10 w-10" />}
          title="No audit entries yet"
          description="All state-changing actions are recorded here in chain order. Activity will appear after your first mutation."
        />
      )}

      {/* Data table — read-only, no row click */}
      {!isLoading && !isError && entries.length > 0 && (
        <>
          <DataTable<AuditEntry>
            columns={columns}
            data={entries}
            getKey={(e) => e.id}
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
