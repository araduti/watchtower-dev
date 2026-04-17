"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FolderTree } from "lucide-react";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
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
 * Local scope shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['scope']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
interface Scope extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  parentScopeId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncateId(id: string, length = 12): string {
  if (id.length <= length) return id;
  const prefix = Math.max(4, length - 4);
  return `${id.slice(0, prefix)}…${id.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "name",
    header: "Name",
    render: (s: Scope) => (
      <span className="font-medium text-foreground">{s.name}</span>
    ),
    minWidth: "180px",
  },
  {
    key: "slug",
    header: "Slug",
    mono: true,
    render: (s: Scope) => (
      <span className="text-muted-foreground">{s.slug}</span>
    ),
    minWidth: "160px",
  },
  {
    key: "parentScopeId",
    header: "Parent Scope",
    mono: true,
    render: (s: Scope) => (
      <span className="text-muted-foreground">
        {s.parentScopeId ? truncateId(s.parentScopeId) : "—"}
      </span>
    ),
    minWidth: "140px",
  },
  {
    key: "createdAt",
    header: "Created At",
    render: (s: Scope) => (
      <span className="text-muted-foreground">
        {new Date(s.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function ScopesPage() {
  const router = useRouter();

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } =
    useCursorPagination();

  /* ---- Data fetch ---- */
  const { data, isLoading, isError, error } = trpc.scope.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const scopes = (data?.items ?? []) as unknown as Scope[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (s: Scope) => router.push(`/dashboard/scopes/${s.id}`),
    [router],
  );

  return (
    <PageContainer
      title="Scopes"
      description="Isolation boundaries for tenants and compliance data"
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={6} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load scopes"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no scopes yet */}
      {!isLoading && !isError && scopes.length === 0 && (
        <EmptyState
          icon={<FolderTree className="h-10 w-10" />}
          title="No scopes yet"
          description="Scopes define isolation boundaries for tenants. They are created as part of workspace setup."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && scopes.length > 0 && (
        <>
          <DataTable<Scope>
            columns={columns}
            data={scopes}
            getKey={(s) => s.id}
            onRowClick={handleRowClick}
          />
          <CursorPagination
            hasNextPage={nextCursor !== null}
            hasPrevPage={hasPrevPage}
            onNextPage={() => {
              if (nextCursor) goToNextPage(nextCursor);
            }}
            onPrevPage={goToPrevPage}
            isLoading={isLoading}
            className="mt-2"
          />
        </>
      )}
    </PageContainer>
  );
}
