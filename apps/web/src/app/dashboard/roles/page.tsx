"use client";

import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";
import { InteractiveButton } from "@/components/shared/interactive-button";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Local role shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['role']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
interface RolePermission {
  key: string;
  category: string;
}

interface Role extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  isAssignable: boolean;
  permissions: RolePermission[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "name",
    header: "Name",
    render: (role: Role) => (
      <span className="font-medium text-foreground">{role.name}</span>
    ),
    minWidth: "140px",
  },
  {
    key: "slug",
    header: "Slug",
    mono: true,
    render: (role: Role) => (
      <span className="text-muted-foreground">{role.slug}</span>
    ),
    minWidth: "120px",
  },
  {
    key: "isSystem",
    header: "Type",
    render: (role: Role) =>
      role.isSystem ? (
        <Badge variant="secondary">System</Badge>
      ) : (
        <Badge variant="outline">Custom</Badge>
      ),
    minWidth: "100px",
  },
  {
    key: "isAssignable",
    header: "Assignable",
    align: "center" as const,
    render: (role: Role) =>
      role.isAssignable ? (
        <span className="text-emerald-400">✓</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "permissions",
    header: "Permissions",
    render: (role: Role) => (
      <Badge variant="outline">
        {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
      </Badge>
    ),
    minWidth: "140px",
  },
  {
    key: "createdAt",
    header: "Created",
    render: (role: Role) => (
      <span className="text-muted-foreground">
        {new Date(role.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function RolesPage() {
  /* ---- Pagination state ---- */
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { data, isLoading, isError, error } = trpc.role.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const roles = (data?.items ?? []) as unknown as Role[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Header action: create role button (disabled placeholder) ---- */
  const headerActions = (
    <InteractiveButton
      icon={<Plus className="h-4 w-4" />}
      disabled
    >
      Create Role
    </InteractiveButton>
  );

  return (
    <PageContainer
      title="Roles"
      description="Manage roles and permission sets for workspace members"
      actions={headerActions}
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={6} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<Lock className="h-10 w-10 text-red-400" />}
          title="Failed to load roles"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no roles */}
      {!isLoading && !isError && roles.length === 0 && (
        <EmptyState
          icon={<Lock className="h-10 w-10" />}
          title="No roles configured"
          description="Create custom roles with specific permission sets to control access within your workspace."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && roles.length > 0 && (
        <>
          <DataTable<Role>
            columns={columns}
            data={roles}
            getKey={(role) => role.id}
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
