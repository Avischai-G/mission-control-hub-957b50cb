import { useState, useEffect } from "react";
import { ShieldCheck, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Cred = {
  id: string;
  credential_name: string;
  provider: string;
  credential_type: string;
  is_set: boolean;
  last_verified_at: string | null;
};

export function CredentialsTab() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ credential_name: "", provider: "", credential_type: "api_key" });
  const { toast } = useToast();

  const fetchCreds = async () => {
    const { data } = await supabase.from("credentials_meta").select("*").order("created_at", { ascending: false });
    setCreds((data as Cred[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCreds(); }, []);

  const addCred = async () => {
    if (!form.credential_name || !form.provider) return;
    const { error } = await supabase.from("credentials_meta").insert(form);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ credential_name: "", provider: "", credential_type: "api_key" });
      setAdding(false);
      fetchCreds();
    }
  };

  const deleteCred = async (id: string) => {
    await supabase.from("credentials_meta").delete().eq("id", id);
    fetchCreds();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Credentials Vault</h3>
          <p className="text-sm text-muted-foreground mt-1">API keys and secrets metadata. Actual secrets are stored server-side only.</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Credential
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Name (e.g. OPENAI_KEY)" value={form.credential_name} onChange={e => setForm(f => ({...f, credential_name: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <input placeholder="Provider" value={form.provider} onChange={e => setForm(f => ({...f, provider: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <select value={form.credential_type} onChange={e => setForm(f => ({...f, credential_type: e.target.value}))} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="api_key">API Key</option>
              <option value="oauth_token">OAuth Token</option>
              <option value="service_account">Service Account</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={addCred} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">Save</button>
            <button onClick={() => setAdding(false)} className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : creds.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 flex flex-col items-center justify-center text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No credentials stored.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Credentials are encrypted at rest and only accessible by the privileged core.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-4 gap-4 border-b border-border bg-secondary/30 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Name</span><span>Provider</span><span>Type</span><span>Actions</span>
          </div>
          {creds.map(c => (
            <div key={c.id} className="grid grid-cols-4 gap-4 border-b border-border px-4 py-3 text-sm items-center">
              <span className="font-mono text-xs text-foreground">{c.credential_name}</span>
              <span className="text-muted-foreground">{c.provider}</span>
              <span className="text-muted-foreground">{c.credential_type}</span>
              <div className="flex gap-2 items-center">
                <span className={`rounded px-2 py-0.5 text-[10px] font-mono ${c.is_set ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                  {c.is_set ? '●●●●●●' : 'Not set'}
                </span>
                <button onClick={() => deleteCred(c.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
