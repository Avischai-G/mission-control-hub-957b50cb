import { useState, useEffect } from "react";
import { Database, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Model = {
  id: string;
  model_id: string;
  provider: string;
  display_name: string;
  model_type: string;
  is_active: boolean;
};

export function ModelsTab() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ model_id: "", provider: "", display_name: "", model_type: "chat" });
  const { toast } = useToast();

  const fetchModels = async () => {
    const { data } = await supabase.from("model_registry").select("*").order("created_at", { ascending: false });
    setModels((data as Model[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchModels(); }, []);

  const addModel = async () => {
    if (!form.model_id || !form.provider || !form.display_name) return;
    const { error } = await supabase.from("model_registry").insert(form);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ model_id: "", provider: "", display_name: "", model_type: "chat" });
      setAdding(false);
      fetchModels();
    }
  };

  const deleteModel = async (id: string) => {
    await supabase.from("model_registry").delete().eq("id", id);
    fetchModels();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("model_registry").update({ is_active: !current }).eq("id", id);
    fetchModels();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Model Registry</h3>
          <p className="text-sm text-muted-foreground mt-1">Configure available AI models, their providers, and routing priorities.</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Model
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Model ID (e.g. gpt-4o)" value={form.model_id} onChange={e => setForm(f => ({...f, model_id: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <input placeholder="Provider (e.g. openai)" value={form.provider} onChange={e => setForm(f => ({...f, provider: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <input placeholder="Display Name" value={form.display_name} onChange={e => setForm(f => ({...f, display_name: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <select value={form.model_type} onChange={e => setForm(f => ({...f, model_type: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="chat">Chat</option>
              <option value="embedding">Embedding</option>
              <option value="completion">Completion</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={addModel} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">Save</button>
            <button onClick={() => setAdding(false)} className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : models.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 flex flex-col items-center justify-center text-center">
          <Database className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No models configured yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add models to the registry for the agent runtime.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-5 gap-4 border-b border-border bg-secondary/30 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Model ID</span><span>Provider</span><span>Name</span><span>Type</span><span>Actions</span>
          </div>
          {models.map(m => (
            <div key={m.id} className="grid grid-cols-5 gap-4 border-b border-border px-4 py-3 text-sm items-center">
              <span className="font-mono text-xs text-foreground">{m.model_id}</span>
              <span className="text-muted-foreground">{m.provider}</span>
              <span className="text-foreground">{m.display_name}</span>
              <span className="text-muted-foreground">{m.model_type}</span>
              <div className="flex gap-2">
                <button onClick={() => toggleActive(m.id, m.is_active)} className={`rounded px-2 py-0.5 text-[10px] font-mono ${m.is_active ? 'bg-success/20 text-success' : 'bg-secondary text-muted-foreground'}`}>
                  {m.is_active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => deleteModel(m.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
