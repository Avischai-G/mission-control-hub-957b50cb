import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelsTab } from "@/components/setup/ModelsTab";
import { CredentialsTab } from "@/components/setup/CredentialsTab";
import { ModelBudgetsTab } from "@/components/setup/ModelBudgetsTab";

interface SetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetupModal({ open, onOpenChange }: SetupModalProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />

      {/* Modal */}
      <div
        className="relative animate-slide-in rounded-lg border border-border bg-card shadow-2xl"
        style={{ width: "95vw", height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            System Setup
          </h2>
          <button
            onClick={close}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-65px)] overflow-auto p-6">
          <Tabs defaultValue="models" className="h-full flex flex-col">
            <TabsList className="bg-secondary/50 border border-border w-fit">
              <TabsTrigger value="models" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Models
              </TabsTrigger>
              <TabsTrigger value="credentials" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Credentials
              </TabsTrigger>
              <TabsTrigger value="budgets" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Model Budgets
              </TabsTrigger>
            </TabsList>
            <TabsContent value="models" className="flex-1 mt-6">
              <ModelsTab />
            </TabsContent>
            <TabsContent value="credentials" className="flex-1 mt-6">
              <CredentialsTab />
            </TabsContent>
            <TabsContent value="budgets" className="flex-1 mt-6">
              <ModelBudgetsTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
