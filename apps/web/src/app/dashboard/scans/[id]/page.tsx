import { Scan } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageContainer
      title="Scan Detail"
      description="Scan results, evidence, and timeline"
    >
      <EmptyState
        icon={<Scan className="h-10 w-10" />}
        title="Scan detail"
        description="Scan detail view with evidence and results will be implemented here."
      />
    </PageContainer>
  );
}
