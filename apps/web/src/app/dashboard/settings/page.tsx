import { Settings } from "lucide-react";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";

export default function SettingsPage() {
  return (
    <PageContainer
      title="Settings"
      description="Workspace configuration and preferences"
    >
      <GlowCard className="p-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">
          Workspace Settings
        </h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Settings className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            Workspace settings — scope isolation mode, billing, and
            integrations — will be configured here.
          </p>
        </div>
      </GlowCard>
    </PageContainer>
  );
}
