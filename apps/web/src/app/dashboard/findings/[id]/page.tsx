import { AlertTriangle } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function FindingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageContainer
      title="Finding Detail"
      description="Finding lifecycle and evidence"
    >
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" />}
        title="Finding detail"
        description="Finding detail view with state transitions will be implemented here."
      />
    </PageContainer>
  );
}
