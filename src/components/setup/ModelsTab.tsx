import { useState, useEffect } from "react";
import { Database, Plus, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Model = {
  id: string;
  model_id: string;
  provider: string;
  display_name: string;
  model_type: string;
  is_active: boolean;
  config: Record<string, unknown> | null;
};

type Cred = {
  id: string;
  credential_name: string;
  provider: string;
  is_set: boolean;
};

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-credentials`;

export function ModelsTab() {
  const [models, setModels] = useState<Model[]>([]);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ model_id: "", display_name: "", model_type: "chat", credential_id: "" });
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const { toast } = useToast();

  const fetchData = async () => {
    const [mRes, cRes] = await Promise.all([
      supabase.from("model_registry").select("*").order("created_at", { ascending: false }),
      supabase.from("credentials_meta").select("id, credential_name, provider, is_set").eq("is_set", true).order("credential_name"),
    ]);
    setModels((mRes.data as Model[]) || []);
    setCreds((cRes.data as Cred[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const selectedCred = creds.find(c => c.id === form.credential_id);

  const verifyModel = async () => {
    if (!form.model_id || !form.credential_id) {
      toast({ title: "Missing fields", description: "Select a credential and enter a model ID first.", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerified(null);
    setVerifyError("");
    try {
      const resp = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: "verify_model",
          credential_meta_id: form.credential_id,
          model_id: form.model_id,
        }),
      });
      const result = await resp.json();
      setVerified(result.success);
      if (!result.success) setVerifyError(result.error || "Verification failed");
    } catch (e: any) {
      setVerified(false);
      setVerifyError(e.message);
    }
    setVerifying(false);
  };

  const addModel = async () => {
    if (!verified) {
      toast({ title: "Verify first", description: "You must verify the model connection before saving.", variant: "destructive" });
      return;
    }
    if (!form.model_id || !form.credential_id || !selectedCred) return;

    const displayName = form.display_name || form.model_id;
    const { error } = await supabase.from("model_registry").insert({
      model_id: form.model_id,
      provider: selectedCred.provider,
      display_name: displayName,
      model_type: form.model_type,
      config: { credential_id: form.credential_id },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ model_id: "", display_name: "", model_type: "chat", credential_id: "" });
      setVerified(null);
      setVerifyError("");
      setAdding(false);
      fetchData();
      toast({ title: "Model added", description: `${displayName} is ready to use.` });
    }
  };

  const deleteModel = async (id: string) => {
    await supabase.from("model_registry").delete().eq("id", id);
    fetchData();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("model_registry").update({ is_active: !current }).eq("id", id);
    fetchData();
  };

  const inputCls = "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Model Registry</h3>
          <p className="text-sm text-muted-foreground mt-1">Configure AI models linked to your credentials. Each model is verified before saving.</p>
        </div>
        <button onClick={() => { setAdding(!adding); setVerified(null); setVerifyError(""); }} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Model
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
          {creds.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No credentials found. Add an API key in the <span className="font-medium text-foreground">Credentials</span> tab first.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">API Key (Credential)</label>
                  <select
                    value={form.credential_id}
                    onChange={e => { setForm(f => ({ ...f, credential_id: e.target.value })); setVerified(null); }}
                    className={inputCls + " w-full"}
                  >
                    <option value="">— Select credential —</option>
                    {creds.map(c => (
                      <option key={c.id} value={c.id}>{c.credential_name} ({c.provider})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Model ID</label>
                  <input
                    placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
                    value={form.model_id}
                    onChange={e => { setForm(f => ({ ...f, model_id: e.target.value })); setVerified(null); }}
                    className={inputCls + " w-full font-mono"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Display Name (optional)</label>
                  <input
                    placeholder="e.g. GPT-4o"
                    value={form.display_name}
                    onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                    className={inputCls + " w-full"}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</label>
                  <select value={form.model_type} onChange={e => setForm(f => ({ ...f, model_type: e.target.value }))} className={inputCls + " w-full"}>
                    <option value="chat">Chat</option>
                    <option value="embedding">Embedding</option>
                    <option value="completion">Completion</option>
                  </select>
                </div>
              </div>

              {/* Verify section */}
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <button
                  onClick={verifyModel}
                  disabled={verifying || !form.model_id || !form.credential_id}
                  className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify Connection"}
                </button>
                {verified === true && (
                  <span className="flex items-center gap-1 text-xs text-primary font-medium">
                    <CheckCircle className="h-4 w-4" /> Connection verified
                  </span>
                )}
                {verified === false && (
                  <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                    <XCircle className="h-4 w-4" /> {verifyError}
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={addModel}
                  disabled={!verified}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Save Model
                </button>
                <button onClick={() => { setAdding(false); setVerified(null); setVerifyError(""); }} className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground hover:bg-secondary/80">Cancel</button>
              </div>
            </>
          )}
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
                <button onClick={() => toggleActive(m.id, m.is_active)} className={`rounded px-2 py-0.5 text-[10px] font-mono ${m.is_active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
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
