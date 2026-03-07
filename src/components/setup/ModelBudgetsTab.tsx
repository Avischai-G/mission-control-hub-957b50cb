import { useState, useEffect } from "react";
import { Wallet, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Budget = {
  id: string;
  model_id: string;
  budget_type: string;
  limit_value: number;
  period: string;
  current_usage: number;
  is_active: boolean;
};

export function ModelBudgetsTab() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ model_id: "", budget_type: "token", limit_value: "1000000", period: "daily" });
  const { toast } = useToast();

  const fetch_ = async () => {
    const { data } = await supabase.from("model_budgets").select("*").order("created_at", { ascending: false });
    setBudgets((data as Budget[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const add = async () => {
    if (!form.model_id) return;
    const { error } = await supabase.from("model_budgets").insert({
      ...form,
      limit_value: parseFloat(form.limit_value),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ model_id: "", budget_type: "token", limit_value: "1000000", period: "daily" });
      setAdding(false);
      fetch_();
    }
  };

  const del = async (id: string) => {
    await supabase.from("model_budgets").delete().eq("id", id);
    fetch_();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Model Budgets</h3>
          <p className="text-sm text-muted-foreground mt-1">Set per-model token and cost budgets with automatic enforcement.</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Budget Rule
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <input placeholder="Model ID" value={form.model_id} onChange={e => setForm(f => ({...f, model_id: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <select value={form.budget_type} onChange={e => setForm(f => ({...f, budget_type: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="token">Token</option>
              <option value="cost">Cost ($)</option>
              <option value="request">Requests</option>
            </select>
            <input type="number" placeholder="Limit" value={form.limit_value} onChange={e => setForm(f => ({...f, limit_value: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <select value={form.period} onChange={e => setForm(f => ({...f, period: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">Save</button>
            <button onClick={() => setAdding(false)} className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : budgets.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 flex flex-col items-center justify-center text-center">
          <Wallet className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No budget rules defined.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Budget enforcement is handled server-side at the policy gateway.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-5 gap-4 border-b border-border bg-secondary/30 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Model</span><span>Type</span><span>Limit</span><span>Usage</span><span>Actions</span>
          </div>
          {budgets.map(b => (
            <div key={b.id} className="grid grid-cols-5 gap-4 border-b border-border px-4 py-3 text-sm items-center">
              <span className="font-mono text-xs text-foreground">{b.model_id}</span>
              <span className="text-muted-foreground">{b.budget_type} / {b.period}</span>
              <span className="text-foreground font-mono">{b.limit_value.toLocaleString()}</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((b.current_usage / b.limit_value) * 100, 100)}%` }} />
                </div>
                <span className="text-xs text-muted-foreground font-mono">{Math.round((b.current_usage / b.limit_value) * 100)}%</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => del(b.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
