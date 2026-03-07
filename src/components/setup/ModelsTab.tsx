import { Database, Plus } from "lucide-react";

export function ModelsTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Model Registry</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Configure available AI models, their providers, and routing priorities.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Model
        </button>
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-8 flex flex-col items-center justify-center text-center">
        <Database className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No models configured yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Connect a backend to register models for the agent runtime.
        </p>
      </div>
    </div>
  );
}
