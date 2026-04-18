"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";
import { InteractiveButton } from "@/components/shared/interactive-button";
import { ClientDate } from "@/components/shared/client-date";
import { OnboardingWizard } from "@/components/tenants/onboarding-wizard";

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
  hasCredentials: boolean;
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
    key: "hasCredentials",
    header: "Connection",
    render: (t: Tenant) =>
      t.hasCredentials ? (
        <span className="flex items-center gap-1 text-xs text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Configured
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Setup needed
        </span>
      ),
  },
  {
    key: "createdAt",
    header: "Created",
    render: (t: Tenant) => (
      <ClientDate value={t.createdAt} variant="date" className="text-muted-foreground" />
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function TenantsPage() {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } = useCursorPagination();

  const { data, isLoading, isError, error } = trpc.tenant.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const tenants = (data?.items ?? []) as unknown as Tenant[];
  const nextCursor = data?.nextCursor ?? null;

  const handleRowClick = useCallback(
    (t: Tenant) => router.push(`/dashboard/tenants/${t.id}`),
    [router],
  );

  const openWizard = useCallback(() => setWizardOpen(true), []);

  return (
    <PageContainer
      title="Tenants"
      description="Connected Microsoft 365 environments"
      actions={
        <InteractiveButton
          icon={<Plus className="h-4 w-4" />}
          onClick={openWizard}
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
              onClick={openWizard}
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

      {/* Onboarding Wizard */}
      <OnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </PageContainer>
  );
}
