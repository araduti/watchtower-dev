import { TopNav } from "@/components/dashboard/top-nav";
import { CommandMenu } from "@/components/dashboard/command-menu";
import { ConsentBanner } from "@/components/compliance/consent-banner";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main>{children}</main>
      <CommandMenu />
      <ConsentBanner />
    </div>
  );
}
