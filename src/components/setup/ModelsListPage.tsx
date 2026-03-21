import { useState, useEffect } from "react";
import { Database, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteManagedModel, setManagedModelActive } from "@/lib/model-registry";
import { PROVIDERS } from "@/lib/provider-config";

type Model = {
  id: string;
  model_id: string;
  provider: string;
  display_name: string;
  model_type: string;
  is_active: boolean;
  context_window_tokens: number | null;
  default_output_tokens: number | null;
};

export function ModelsListPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = async () => {
    const { data } = await supabase.from("model_registry").select("*").order("provider").order("display_name");
    setModels((data as Model[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const toggleActive = async (id: string, current: boolean) => {
    await setManagedModelActive(id, !current);
    fetch_();
  };

  const deleteModel = async (id: string) => {
    await deleteManagedModel(id);
    fetch_();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <Database className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No models registered yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Set up a provider in AI Setup to add models.</p>
      </div>
    );
  }

  // Group by provider
  const grouped = models.reduce<Record<string, Model[]>>((acc, m) => {
    (acc[m.provider] = acc[m.provider] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">All registered models across providers.</p>
      {Object.entries(grouped).map(([providerKey, providerModels]) => {
        const provDef = PROVIDERS.find(p => p.key === providerKey);
        return (
          <div key={providerKey} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{provDef?.icon || "📦"}</span>
              <h4 className="text-sm font-medium text-foreground">{provDef?.name || providerKey}</h4>
              <span className="text-[10px] text-muted-foreground font-mono">{providerModels.length} model{providerModels.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              {providerModels.map(m => (
                <div key={m.id} className="flex items-center gap-4 border-b last:border-b-0 border-border px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-foreground flex-1">{m.model_id}</span>
                  <span className="text-muted-foreground text-xs">{m.display_name}</span>
                  <span className="text-muted-foreground text-[10px] font-mono">{m.model_type}</span>
                  <span className="text-muted-foreground text-[10px] font-mono">
                    {m.context_window_tokens ? `${Math.round(m.context_window_tokens / 1000)}k ctx` : "ctx auto"}
                  </span>
                  <button
                    onClick={() => toggleActive(m.id, m.is_active)}
                    className={`rounded px-2 py-0.5 text-[10px] font-mono transition-colors ${m.is_active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => deleteModel(m.id)} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
