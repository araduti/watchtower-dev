import { Scan } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState } from "@/components/shared/empty-loading";

export default function ScansPage() {
  return (
    <PageContainer
      title="Scans"
      description="Compliance scan history and triggers"
    >
      <EmptyState
        icon={<Scan className="h-10 w-10" />}
        title="No scans yet"
        description="Trigger your first compliance scan to audit your M365 tenants against CIS and NIST frameworks."
      />
    </PageContainer>
  );
}
