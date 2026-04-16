import { ScrollText } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function AuditLogPage() {
  return (
    <PageContainer
      title="Audit Log"
      description="Tamper-evident, chain-ordered activity log"
    >
      <EmptyState
        icon={<ScrollText className="h-10 w-10" />}
        title="No audit entries yet"
        description="All state-changing actions are recorded here in chain order. Activity will appear after your first mutation."
      />
    </PageContainer>
  );
}
