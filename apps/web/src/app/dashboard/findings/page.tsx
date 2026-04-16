import { AlertTriangle } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function FindingsPage() {
  return (
    <PageContainer
      title="Findings"
      description="Compliance findings across all tenants"
    >
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" />}
        title="No findings yet"
        description="Findings will appear here after your first scan completes. Trigger a scan from the Scans page to begin."
      />
    </PageContainer>
  );
}
