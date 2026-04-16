"use client";

import { Users, UserPlus } from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";
import { InteractiveButton } from "@/components/shared/interactive-button";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

/**
 * Role slugs that are built-in to the system. These get the "secondary"
 * badge variant to visually distinguish them from user-created custom roles,
 * which receive the "outline" variant.
 */
const SYSTEM_ROLE_SLUGS = new Set(["owner", "admin", "member", "viewer"]);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Local member shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['member']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
interface MemberRole {
  id: string;
  name: string;
  slug: string;
}

interface Member extends Record<string, unknown> {
  id: string;
  userId: string;
  workspaceId: string;
  scopeId: string | null;
  roles: MemberRole[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "userId",
    header: "User ID",
    mono: true,
    render: (m: Member) => (
      <span
        className="font-medium text-foreground"
        title={m.userId}
      >
        {m.userId.slice(0, 8)}
      </span>
    ),
    minWidth: "120px",
  },
  {
    key: "scopeId",
    header: "Scope",
    mono: true,
    render: (m: Member) =>
      m.scopeId ? (
        <span className="text-muted-foreground" title={m.scopeId}>
          {m.scopeId.slice(0, 8)}
        </span>
      ) : (
        <span className="text-muted-foreground italic">Workspace-wide</span>
      ),
    minWidth: "140px",
  },
  {
    key: "roles",
    header: "Roles",
    render: (m: Member) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {m.roles.map((role) => (
          <Badge
            key={role.id}
            variant={SYSTEM_ROLE_SLUGS.has(role.slug) ? "secondary" : "outline"}
          >
            {role.name}
          </Badge>
        ))}
      </div>
    ),
    minWidth: "180px",
  },
  {
    key: "createdAt",
    header: "Joined",
    render: (m: Member) => (
      <span className="text-muted-foreground">
        {new Date(m.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function MembersPage() {
  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } = useCursorPagination();

  const { data, isLoading, isError, error } = trpc.member.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const members = (data?.items ?? []) as unknown as Member[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Header action: invite button (disabled placeholder) ---- */
  const headerActions = (
    <InteractiveButton
      icon={<UserPlus className="h-4 w-4" />}
      disabled
    >
      Invite Member
    </InteractiveButton>
  );

  return (
    <PageContainer
      title="Members"
      description="Team members and workspace access"
      actions={headerActions}
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={6} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<Users className="h-10 w-10 text-red-400" />}
          title="Failed to load members"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no members */}
      {!isLoading && !isError && members.length === 0 && (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No team members"
          description="Invite team members to collaborate on compliance management within this workspace."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && members.length > 0 && (
        <>
          <DataTable<Member>
            columns={columns}
            data={members}
            getKey={(m) => m.id}
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
