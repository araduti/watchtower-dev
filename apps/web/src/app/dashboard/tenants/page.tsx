"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
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
import { InteractiveButton } from "@/components/shared/interactive-button";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Local tenant shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['tenant']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
interface Tenant extends Record<string, unknown> {
  id: string;
  workspaceId: string;
  scopeId: string;
  displayName: string;
  msTenantId: string;
  authMethod: "CLIENT_SECRET" | "WORKLOAD_IDENTITY";
  status: "ACTIVE" | "DISCONNECTED" | "ERROR";
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Status badge variant mapping                                       */
/* ------------------------------------------------------------------ */

const STATUS_BADGE = {
  ACTIVE: { variant: "compliant" as const, label: "Active" },
  DISCONNECTED: { variant: "high" as const, label: "Disconnected" },
  ERROR: { variant: "critical" as const, label: "Error" },
} as const;

const AUTH_LABELS: Record<Tenant["authMethod"], string> = {
  CLIENT_SECRET: "Client Secret",
  WORKLOAD_IDENTITY: "Workload Identity",
};

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "displayName",
    header: "Display Name",
    render: (t: Tenant) => (
      <span className="font-medium text-foreground">{t.displayName}</span>
    ),
    minWidth: "180px",
  },
  {
    key: "msTenantId",
    header: "M365 Tenant ID",
    mono: true,
    render: (t: Tenant) => (
      <span className="text-muted-foreground">{t.msTenantId}</span>
    ),
    minWidth: "280px",
  },
  {
    key: "authMethod",
    header: "Auth Method",
    render: (t: Tenant) => (
      <Badge variant="secondary" className="text-[11px]">
        {AUTH_LABELS[t.authMethod]}
      </Badge>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (t: Tenant) => {
      const cfg = STATUS_BADGE[t.status];
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
  },
  {
    key: "createdAt",
    header: "Created",
    render: (t: Tenant) => (
      <span className="text-muted-foreground">
        {new Date(t.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function TenantsPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [msTenantId, setMsTenantId] = useState("");
  const [authMethod, setAuthMethod] = useState<"CLIENT_SECRET" | "WORKLOAD_IDENTITY">("CLIENT_SECRET");
  const [selectedScopeId, setSelectedScopeId] = useState("");

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } = useCursorPagination();

  const { data, isLoading, isError, error } = trpc.tenant.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const tenants = (data?.items ?? []) as unknown as Tenant[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Scope list for create dialog ---- */
  const { data: scopeData } = trpc.scope.list.useQuery({ limit: 100 });
  const scopes = scopeData?.items ?? [];

  /* ---- Create tenant mutation ---- */
  const utils = trpc.useUtils();
  const createMutation = trpc.tenant.create.useMutation({
    onSuccess: (tenant) => {
      utils.tenant.list.invalidate();
      setCreateOpen(false);
      setDisplayName("");
      setMsTenantId("");
      router.push(`/dashboard/tenants/${tenant.id}`);
    },
  });

  const handleRowClick = useCallback(
    (t: Tenant) => router.push(`/dashboard/tenants/${t.id}`),
    [router],
  );

  const openCreateDialog = useCallback(() => setCreateOpen(true), []);

  return (
    <PageContainer
      title="Tenants"
      description="Connected Microsoft 365 environments"
      actions={
        <InteractiveButton
          icon={<Plus className="h-4 w-4" />}
          onClick={openCreateDialog}
          aria-label="Connect a new tenant"
        >
          Connect Tenant
        </InteractiveButton>
      }
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={6} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<Building2 className="h-10 w-10 text-red-400" />}
          title="Failed to load tenants"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no tenants yet */}
      {!isLoading && !isError && tenants.length === 0 && (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="No tenants connected"
          description="Connect your first Microsoft 365 tenant to begin compliance monitoring."
          action={
            <InteractiveButton
              icon={<Plus className="h-4 w-4" />}
              onClick={openCreateDialog}
            >
              Connect Tenant
            </InteractiveButton>
          }
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && tenants.length > 0 && (
        <>
          <DataTable<Tenant>
            columns={columns}
            data={tenants}
            getKey={(t) => t.id}
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
      {/* Create Tenant Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Tenant</DialogTitle>
            <DialogDescription>
              Connect a Microsoft 365 tenant to begin compliance monitoring.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tenant-name" className="text-sm font-medium">Display Name</label>
              <Input
                id="tenant-name"
                placeholder="e.g. Contoso Production"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ms-tenant-id" className="text-sm font-medium">M365 Tenant ID</label>
              <Input
                id="ms-tenant-id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={msTenantId}
                onChange={(e) => setMsTenantId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Auth Method</label>
              <Select value={authMethod} onValueChange={(v) => setAuthMethod(v as "CLIENT_SECRET" | "WORKLOAD_IDENTITY")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_SECRET">Client Secret</SelectItem>
                  <SelectItem value="WORKLOAD_IDENTITY">Workload Identity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Scope</label>
              <Select value={selectedScopeId} onValueChange={setSelectedScopeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a scope…" />
                </SelectTrigger>
                <SelectContent>
                  {(scopes as Array<{ id: string; name: string }>).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scopes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No scopes available. <a href="/dashboard/scopes" className="underline text-primary">Create a scope</a> first.
                </p>
              )}
            </div>
            {createMutation.error && (
              <p className="text-sm text-red-400">{createMutation.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!displayName || !msTenantId || !selectedScopeId || createMutation.isPending}
              onClick={() => createMutation.mutate({
                idempotencyKey: crypto.randomUUID(),
                displayName,
                msTenantId,
                authMethod,
                scopeId: selectedScopeId,
              })}
            >
              {createMutation.isPending ? "Creating…" : "Connect Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
