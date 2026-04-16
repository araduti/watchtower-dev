import { Users } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function MembersPage() {
  return (
    <PageContainer
      title="Members"
      description="Team members and workspace access"
    >
      <EmptyState
        icon={<Users className="h-10 w-10" />}
        title="No team members"
        description="Invite team members to collaborate on compliance management within this workspace."
      />
    </PageContainer>
  );
}
