import { Layers } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function FrameworksPage() {
  return (
    <PageContainer
      title="Frameworks"
      description="Compliance frameworks and check catalogs"
    >
      <EmptyState
        icon={<Layers className="h-10 w-10" />}
        title="No frameworks loaded"
        description="Compliance frameworks (CIS, NIST) and their mapped checks will appear here once configured."
      />
    </PageContainer>
  );
}
