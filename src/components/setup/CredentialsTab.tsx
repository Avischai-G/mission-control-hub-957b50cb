import { useState, useEffect } from "react";
import { ShieldCheck, Plus, Trash2, Loader2, CheckCircle, XCircle, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Cred = {
  id: string;
  credential_name: string;
  provider: string;
  credential_type: string;
  is_set: boolean;
  masked_value: string | null;
  last_verified_at: string | null;
};

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google / Gemini" },
  { value: "mistral", label: "Mistral" },
  { value: "cohere", label: "Cohere" },
  { value: "groq", label: "Groq" },
  { value: "perplexity", label: "Perplexity" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "together", label: "Together AI" },
  { value: "fireworks", label: "Fireworks AI" },
  { value: "custom", label: "Custom / Other" },
];

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-credentials`;

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

export function CredentialsTab() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ credential_name: "", provider: "openai", api_key: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateValue, setUpdateValue] = useState("");
  const { toast } = useToast();

  const fetchCreds = async () => {
    const { data } = await supabase.from("credentials_meta").select("*").order("created_at", { ascending: false });
    setCreds((data as Cred[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCreds(); }, []);

  const callManageCredentials = async (body: Record<string, unknown>) => {
    const resp = await fetch(FUNCTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    return resp.json();
  };

  const addCredWithKey = async () => {
    if (!form.credential_name.trim() || !form.provider || !form.api_key.trim()) {
      toast({ title: "All fields required", description: "Provider, name, and API key are all required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Create the metadata entry
      const masked = maskKey(form.api_key.trim());
      const { data, error } = await supabase.from("credentials_meta").insert({
        credential_name: form.credential_name.trim(),
        provider: form.provider,
        credential_type: "api_key",
        is_set: true,
        masked_value: masked,
      }).select("id").single();
      if (error) throw error;

      // Store the actual key via edge function
      await callManageCredentials({
        action: "set",
        credential_meta_id: data.id,
        value: form.api_key.trim(),
      });

      setForm({ credential_name: "", provider: "openai", api_key: "" });
      setAdding(false);
      fetchCreds();
      toast({ title: "Credential saved", description: "API key stored securely." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteCred = async (id: string) => {
    await callManageCredentials({ action: "unset", credential_meta_id: id });
    await supabase.from("credentials_meta").delete().eq("id", id);
    fetchCreds();
  };

  const updateKey = async (credId: string) => {
    if (!updateValue.trim()) return;
    setSaving(true);
    const masked = maskKey(updateValue.trim());
    const result = await callManageCredentials({
      action: "set",
      credential_meta_id: credId,
      value: updateValue.trim(),
    });
    if (result.success) {
      await supabase.from("credentials_meta").update({ masked_value: masked }).eq("id", credId);
      toast({ title: "Updated", description: "API key updated securely." });
      setUpdatingId(null);
      setUpdateValue("");
      fetchCreds();
    } else {
      toast({ title: "Error", description: result.error || "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  const testCred = async (credId: string) => {
    setTesting(credId);
    const result = await callManageCredentials({ action: "test", credential_meta_id: credId });
    setTesting(null);
    if (result.success) {
      toast({ title: "✓ Valid", description: "Credential verified successfully." });
      fetchCreds();
    } else {
      toast({ title: "✗ Invalid", description: result.error || "Verification failed", variant: "destructive" });
    }
  };

  const inputCls = "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Credentials Vault</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Store API keys for your AI providers. Keys are stored server-side and never shown again after saving.
          </p>
        </div>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Credential
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Provider</label>
              <select
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                className={inputCls + " w-full"}
              >
                {PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Key Name</label>
              <input
                placeholder="e.g. MY_OPENAI_KEY"
                value={form.credential_name}
                onChange={e => setForm(f => ({ ...f, credential_name: e.target.value }))}
                className={inputCls + " w-full"}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">API Key</label>
              <input
                type="password"
                placeholder="sk-..."
                value={form.api_key}
                onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                className={inputCls + " w-full font-mono"}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addCredWithKey} disabled={saving} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Securely"}
            </button>
            <button onClick={() => { setAdding(false); setForm({ credential_name: "", provider: "openai", api_key: "" }); }} className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80">Cancel</button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            After saving, the full API key will never be shown again — only the first and last 4 characters.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : creds.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 flex flex-col items-center justify-center text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No credentials stored.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add your provider API keys to enable agent model routing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {creds.map(c => (
            <div key={c.id} className="rounded-lg border border-border bg-secondary/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-medium text-foreground">{c.credential_name}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {PROVIDERS.find(p => p.value === c.provider)?.label || c.provider}
                    </span>
                  </div>
                  {c.is_set && c.masked_value && (
                    <span className="font-mono text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                      {c.masked_value}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.is_set ? (
                    <span className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono bg-primary/20 text-primary">
                      <CheckCircle className="h-3 w-3" /> Set
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground">
                      <XCircle className="h-3 w-3" /> Not set
                    </span>
                  )}
                  {c.last_verified_at && (
                    <span className="text-[10px] text-muted-foreground">
                      Verified {new Date(c.last_verified_at).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => { setUpdatingId(updatingId === c.id ? null : c.id); setUpdateValue(""); }}
                    className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    Update Key
                  </button>
                  {c.is_set && (
                    <button
                      onClick={() => testCred(c.id)}
                      disabled={testing === c.id}
                      className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      title="Test connection"
                    >
                      {testing === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                    </button>
                  )}
                  <button onClick={() => deleteCred(c.id)} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {updatingId === c.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <input
                    type="password"
                    value={updateValue}
                    onChange={e => setUpdateValue(e.target.value)}
                    placeholder="Paste new API key..."
                    className={inputCls + " w-full font-mono text-xs"}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateKey(c.id)}
                      disabled={saving || !updateValue.trim()}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update Securely"}
                    </button>
                    <button
                      onClick={() => { setUpdatingId(null); setUpdateValue(""); }}
                      className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
