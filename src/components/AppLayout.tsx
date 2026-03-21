import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarExplorerProvider, useSidebarExplorer } from "@/components/explorer/SidebarExplorer";
import { useState } from "react";
import { SetupModal } from "@/components/SetupModal";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AppLayoutProps {
  children: React.ReactNode;
}

function MainArea({ children }: { children: React.ReactNode }) {
  const { explorer, setIsOpen } = useSidebarExplorer();

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen">
      <header className="h-11 flex items-center justify-between border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0 px-2 sticky top-0 z-30">
        <div className="flex items-center">
          <SidebarTrigger />
          <div className="ml-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
            <span className="font-mono text-xs text-muted-foreground">SYSTEM ONLINE</span>
          </div>
        </div>
        <ThemeToggle />
      </header>
      <main
        className="flex-1 overflow-auto"
        onClick={() => {
          explorer?.onCollapse?.();
          setIsOpen(false);
        }}
      >
        {children}
      </main>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <SidebarProvider>
      <SidebarExplorerProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar onOpenSetup={() => setSetupOpen(true)} />
          <MainArea>{children}</MainArea>
        </div>
        <SetupModal open={setupOpen} onOpenChange={setSetupOpen} />
      </SidebarExplorerProvider>
    </SidebarProvider>
  );
}
