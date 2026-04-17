"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FolderTree,
  Hash,
  Tag,
  Layers,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { LoadingState } from "@/components/shared/empty-loading";

/* ------------------------------------------------------------------ */
/*  Detail row                                                        */
/* ------------------------------------------------------------------ */

function DetailRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 text-muted-foreground/60 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {label}
        </p>
        <div
          className={
            mono
              ? "mt-0.5 text-sm font-mono text-foreground break-all"
              : "mt-0.5 text-sm text-foreground"
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function ScopeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);

  const { data: scope, isLoading, error } = trpc.scope.get.useQuery({
    scopeId: id,
  });

  /* Loading state */
  if (isLoading) {
    return (
      <PageContainer title="Scope Detail" description="Loading scope…">
        <Link
          href="/dashboard/scopes"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Scopes
        </Link>
        <LoadingState rows={6} />
      </PageContainer>
    );
  }

  /* Error state */
  if (error || !scope) {
    return (
      <PageContainer title="Scope Detail" description="Unable to load scope">
        <Link
          href="/dashboard/scopes"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Scopes
        </Link>
        <GlowCard glow="red" className="p-6">
          <p className="text-destructive">
            {error?.message ?? "Scope not found."}
          </p>
        </GlowCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={scope.name}
      description="Scope configuration and hierarchy"
    >
      {/* Back link */}
      <Link
        href="/dashboard/scopes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scopes
      </Link>

      {/* Details card */}
      <GlowCard className="p-6">
        {/* Card header */}
        <div className="flex items-center gap-3 border-b border-border/20 pb-4 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/30">
            <FolderTree className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {scope.name}
            </h2>
            <p className="text-xs font-mono text-muted-foreground">{scope.id}</p>
          </div>
        </div>

        {/* Details grid — 2 columns */}
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          <DetailRow
            icon={<Hash className="h-4 w-4" />}
            label="Scope ID"
            value={scope.id}
            mono
          />
          <DetailRow
            icon={<Tag className="h-4 w-4" />}
            label="Slug"
            value={scope.slug}
            mono
          />
          <DetailRow
            icon={<FolderTree className="h-4 w-4" />}
            label="Name"
            value={scope.name}
          />
          <DetailRow
            icon={<Layers className="h-4 w-4" />}
            label="Parent Scope ID"
            value={scope.parentScopeId ?? "—"}
            mono
          />
          <DetailRow
            icon={<Calendar className="h-4 w-4" />}
            label="Created At"
            value={fmtDate(scope.createdAt)}
          />
          <DetailRow
            icon={<RefreshCw className="h-4 w-4" />}
            label="Updated At"
            value={fmtDate(scope.updatedAt)}
          />
        </div>
      </GlowCard>
    </PageContainer>
  );
}
