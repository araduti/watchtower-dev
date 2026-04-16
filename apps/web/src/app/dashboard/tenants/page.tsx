"use client";

import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
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
  const { data, isLoading, isError, error } = trpc.tenant.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
  });

  const tenants = (data?.items ?? []) as unknown as Tenant[];

  return (
    <PageContainer
      title="Tenants"
      description="Connected Microsoft 365 environments"
      actions={
        <InteractiveButton
          icon={<Plus className="h-4 w-4" />}
          disabled
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
              disabled
            >
              Connect Tenant
            </InteractiveButton>
          }
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && tenants.length > 0 && (
        <DataTable<Tenant>
          columns={columns}
          data={tenants}
          getKey={(t) => t.id}
          onRowClick={(t) => router.push(`/dashboard/tenants/${t.id}`)}
        />
      )}
    </PageContainer>
  );
}
