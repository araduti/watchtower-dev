import { Building2 } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageContainer
      title="Tenant Detail"
      description="Tenant findings, scans, and configuration"
    >
      <EmptyState
        icon={<Building2 className="h-10 w-10" />}
        title="Tenant detail"
        description="Tenant detail view with tabbed findings, scans, and settings will be implemented here."
      />
    </PageContainer>
  );
}
