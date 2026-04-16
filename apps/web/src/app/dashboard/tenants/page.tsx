import { Building2 } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function TenantsPage() {
  return (
    <PageContainer
      title="Tenants"
      description="Connected Microsoft 365 environments"
    >
      <EmptyState
        icon={<Building2 className="h-10 w-10" />}
        title="No tenants connected"
        description="Connect your first Microsoft 365 tenant to begin compliance monitoring."
      />
    </PageContainer>
  );
}
