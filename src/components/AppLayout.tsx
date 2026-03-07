import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useState } from "react";
import { SetupModal } from "@/components/SetupModal";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar onOpenSetup={() => setSetupOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-11 flex items-center border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
            <SidebarTrigger className="ml-2" />
            <div className="ml-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
              <span className="font-mono text-xs text-muted-foreground">SYSTEM ONLINE</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
      <SetupModal open={setupOpen} onOpenChange={setSetupOpen} />
    </SidebarProvider>
  );
}
