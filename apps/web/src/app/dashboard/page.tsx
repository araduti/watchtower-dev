import { Shield, AlertTriangle, Scan, Building2 } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { DashboardGrid } from "@/components/shared/layouts";
import { GlowCard, MetricCard } from "@/components/shared/glow-card";

export default function DashboardOverviewPage() {
  return (
    <PageContainer
      title="Dashboard"
      description="Workspace compliance posture overview"
    >
      {/* KPI metrics row */}
      <DashboardGrid cols={4}>
        <MetricCard
          label="Total Findings"
          value="—"
          sublabel="Across all tenants"
          glow="red"
        />
        <MetricCard
          label="Critical / High"
          value="—"
          sublabel="Requires attention"
          glow="amber"
        />
        <MetricCard
          label="Tenants"
          value="—"
          sublabel="Connected environments"
          glow="blue"
        />
        <MetricCard
          label="Compliance Score"
          value="—"
          sublabel="Weighted average"
          glow="green"
        />
      </DashboardGrid>

      {/* Placeholder sections */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlowCard className="p-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            Recent Findings
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No findings yet. Trigger a scan to begin.
            </p>
          </div>
        </GlowCard>

        <GlowCard className="p-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            Recent Scans
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Scan className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No scans have been run yet.
            </p>
          </div>
        </GlowCard>
      </div>
    </PageContainer>
  );
}
