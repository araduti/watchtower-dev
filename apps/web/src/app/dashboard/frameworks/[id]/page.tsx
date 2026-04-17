"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Layers, ListChecks } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { LoadingState, EmptyState } from "@/components/shared/empty-loading";
import { Badge } from "@watchtower/ui";
import { ClientDate } from "@/components/shared/client-date";

export default function FrameworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: framework, isLoading, error } = trpc.framework.get.useQuery({ frameworkId: id });

  if (isLoading) {
    return (
      <PageContainer title="Framework Detail" description="Loading framework...">
        <LoadingState rows={4} />
      </PageContainer>
    );
  }

  if (error || !framework) {
    return (
      <PageContainer title="Framework Detail" description="Framework not found">
        <EmptyState
          icon={<Layers className="h-10 w-10" />}
          title="Framework not found"
          description={error?.message ?? "The requested framework could not be loaded."}
          action={
            <Link
              href="/dashboard/frameworks"
              className="inline-flex items-center gap-2 text-sm text-[#3b82f6] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Frameworks
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={framework.name}
      description="Framework details and mapped checks"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {framework.slug}
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            v{framework.version}
          </Badge>
        </div>
      }
    >
      {/* Back link */}
      <Link
        href="/dashboard/frameworks"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Frameworks
      </Link>

      <div className="space-y-6">
        {/* Framework Details */}
        <GlowCard glow="blue">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Details</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Publisher
              </dt>
              <dd className="mt-1 text-sm font-medium">{framework.publisher}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Version
              </dt>
              <dd className="mt-1 font-mono text-sm">{framework.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Slug
              </dt>
              <dd className="mt-1 font-mono text-sm">{framework.slug}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                URL
              </dt>
              <dd className="mt-1 text-sm">
                {framework.url ? (
                  <a
                    href={framework.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#3b82f6] hover:underline"
                  >
                    {framework.url}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Added
              </dt>
              <dd className="mt-1 font-mono text-sm">
                <ClientDate value={framework.createdAt} variant="date" />
              </dd>
            </div>
          </dl>
        </GlowCard>

        {/* Associated Checks */}
        <GlowCard glow="none">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Associated Checks</h2>
          <EmptyState
            icon={<ListChecks className="h-10 w-10" />}
            title="No checks mapped"
            description="Checks mapped to this framework will appear here."
          />
        </GlowCard>
      </div>
    </PageContainer>
  );
}
