import { Layers } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function FrameworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageContainer
      title="Framework Detail"
      description="Framework checks and compliance mapping"
    >
      <EmptyState
        icon={<Layers className="h-10 w-10" />}
        title="Framework detail"
        description="Framework detail view with mapped checks and compliance coverage will be implemented here."
      />
    </PageContainer>
  );
}
