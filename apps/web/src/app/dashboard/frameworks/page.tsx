"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, Layers } from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
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
 * Local framework shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['framework']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
interface Framework extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  version: string;
  url: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "name",
    header: "Name",
    render: (fw: Framework) => (
      <span className="font-medium text-foreground">{fw.name}</span>
    ),
    minWidth: "200px",
  },
  {
    key: "slug",
    header: "Slug",
    mono: true,
    render: (fw: Framework) => (
      <Badge variant="secondary" className="font-mono text-xs">
        {fw.slug}
      </Badge>
    ),
  },
  {
    key: "publisher",
    header: "Publisher",
    render: (fw: Framework) => (
      <span className="text-muted-foreground">{fw.publisher}</span>
    ),
  },
  {
    key: "version",
    header: "Version",
    render: (fw: Framework) => (
      <Badge variant="outline" className="font-mono text-xs">
        {fw.version}
      </Badge>
    ),
  },
  {
    key: "url",
    header: "URL",
    render: (fw: Framework) =>
      fw.url ? (
        <a
          href={fw.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Link
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "createdAt",
    header: "Added",
    render: (fw: Framework) => (
      <span className="text-muted-foreground">
        {new Date(fw.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function FrameworksPage() {
  const router = useRouter();

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } = useCursorPagination();

  const { data, isLoading, isError, error } =
    trpc.framework.list.useQuery({ limit: DEFAULT_PAGE_SIZE, cursor });

  const frameworks = (data?.items ?? []) as unknown as Framework[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Row click handler ---- */
  const handleRowClick = useCallback(
    (fw: Framework) => router.push(`/dashboard/frameworks/${fw.id}`),
    [router],
  );

  return (
    <PageContainer
      title="Frameworks"
      description="Compliance frameworks and check catalogs"
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={6} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-red-400" />}
          title="Failed to load frameworks"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no frameworks loaded */}
      {!isLoading && !isError && frameworks.length === 0 && (
        <EmptyState
          icon={<Layers className="h-10 w-10" />}
          title="No frameworks loaded"
          description="Compliance frameworks (CIS, NIST) and their mapped checks will appear here once configured."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && frameworks.length > 0 && (
        <>
          <DataTable<Framework>
            columns={columns}
            data={frameworks}
            getKey={(fw) => fw.id}
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
