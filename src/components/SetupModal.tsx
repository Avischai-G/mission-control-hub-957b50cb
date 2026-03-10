import { useEffect, useCallback, useState } from "react";
import { X, Cpu, Key, Database, BarChart3, Radio, Brain } from "lucide-react";
import { AISetupPage } from "@/components/setup/AISetupPage";
import { APIKeysPage } from "@/components/setup/APIKeysPage";
import { ModelsListPage } from "@/components/setup/ModelsListPage";
import { BudgetPage } from "@/components/setup/BudgetPage";
import { LiveFeedTab } from "@/components/setup/LiveFeedTab";
import { GlobalMemoryTab } from "@/components/setup/GlobalMemoryTab";

interface SetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPage?: string;
}

const SIDEBAR_ITEMS = [
  { key: "ai-setup", label: "AI Setup", icon: Cpu },
  { key: "api-keys", label: "API Keys", icon: Key },
  { key: "models", label: "Models", icon: Database },
  { key: "budget", label: "Budget & Usage", icon: BarChart3 },
  { key: "live-feed", label: "Live Feed", icon: Radio },
  { key: "memory", label: "Global Memory", icon: Brain },
];

export function SetupModal({ open, onOpenChange, initialPage }: SetupModalProps) {
  const [activePage, setActivePage] = useState(initialPage || "ai-setup");
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  useEffect(() => {
    if (initialPage) setActivePage(initialPage);
  }, [initialPage]);

  if (!open) return null;

  const renderContent = () => {
    switch (activePage) {
      case "ai-setup": return <AISetupPage onNavigate={setActivePage} />;
      case "api-keys": return <APIKeysPage />;
      case "models": return <ModelsListPage />;
      case "budget": return <BudgetPage />;
      case "live-feed": return <LiveFeedTab />;
      case "memory": return <GlobalMemoryTab />;
      default: return <AISetupPage onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={close}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      <div
        className="relative animate-slide-in rounded-lg border border-border bg-card shadow-2xl flex overflow-hidden"
        style={{ width: "85vw", height: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-52 shrink-0 border-r border-border bg-secondary/20 flex flex-col">
          <div className="px-4 py-4 border-b border-border">
            <h2 className="font-display text-sm font-semibold text-foreground">System Setup</h2>
          </div>
          <nav className="flex-1 p-2 space-y-0.5">
            {SIDEBAR_ITEMS.map(item => (
              <button
                key={item.key}
                onClick={() => setActivePage(item.key)}
                className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  activePage === item.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <h3 className="font-display text-base font-semibold text-foreground">
              {SIDEBAR_ITEMS.find(i => i.key === activePage)?.label || "Setup"}
            </h3>
            <button onClick={close} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
