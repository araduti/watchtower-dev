import { Lock } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function RolesPage() {
  return (
    <PageContainer
      title="Roles"
      description="Role-based access control and permissions"
    >
      <EmptyState
        icon={<Lock className="h-10 w-10" />}
        title="No custom roles"
        description="Create custom roles to fine-tune team access to scopes, tenants, and findings."
      />
    </PageContainer>
  );
}
