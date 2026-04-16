"use client";

import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
} from "@watchtower/ui";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleSlug, setRoleSlug] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } = useCursorPagination();

  const { data, isLoading, isError, error } = trpc.role.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const roles = (data?.items ?? []) as unknown as Role[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Permission list for create dialog ---- */
  const { data: permData } = trpc.permission.list.useQuery({});
  const permissions = (permData?.items ?? []) as Array<{ key: string; category: string }>;

  /* ---- Create role mutation ---- */
  const utils = trpc.useUtils();
  const createMutation = trpc.role.create.useMutation({
    onSuccess: () => {
      utils.role.list.invalidate();
      setCreateOpen(false);
      setRoleName("");
      setRoleSlug("");
      setRoleDescription("");
      setSelectedPermissions([]);
    },
  });

  const togglePermission = (key: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  /* ---- Header action: create role button ---- */
  const headerActions = (
    <InteractiveButton
      icon={<Plus className="h-4 w-4" />}
      onClick={() => setCreateOpen(true)}
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
            hasPrevPage={hasPrevPage}
            onNextPage={() => { if (nextCursor) goToNextPage(nextCursor); }}
            onPrevPage={goToPrevPage}
            isLoading={isLoading}
            className="mt-2"
          />
        </>
      )}
      {/* Create Role Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Custom Role</DialogTitle>
            <DialogDescription>
              Define a custom role with specific permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="role-name" className="text-sm font-medium">Name</label>
              <Input
                id="role-name"
                placeholder="e.g. Security Analyst"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="role-slug" className="text-sm font-medium">Slug</label>
              <Input
                id="role-slug"
                placeholder="e.g. security-analyst"
                value={roleSlug}
                onChange={(e) => setRoleSlug(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="role-desc" className="text-sm font-medium">Description (optional)</label>
              <Input
                id="role-desc"
                placeholder="Brief description of this role"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Permissions ({selectedPermissions.length} selected)</label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40 p-2">
                {permissions.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/30 rounded cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(p.key)}
                      onChange={() => togglePermission(p.key)}
                      className="rounded border-border"
                    />
                    <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                  </label>
                ))}
              </div>
            </div>
            {createMutation.error && (
              <p className="text-sm text-red-400">{createMutation.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!roleName || !roleSlug || selectedPermissions.length === 0 || createMutation.isPending}
              onClick={() => createMutation.mutate({
                idempotencyKey: crypto.randomUUID(),
                name: roleName,
                slug: roleSlug,
                ...(roleDescription ? { description: roleDescription } : {}),
                permissionKeys: selectedPermissions,
              })}
            >
              {createMutation.isPending ? "Creating…" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
