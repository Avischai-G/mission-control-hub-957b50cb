import { useState, useEffect } from "react";
import { ShieldCheck, Plus, Trash2, Loader2, Eye, EyeOff, CheckCircle, XCircle, FlaskConical } from "lucide-react";
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

const CRED_TYPES = [
  { value: "api_key", label: "API Key" },
  { value: "oauth_token", label: "OAuth Token" },
  { value: "oauth_client", label: "OAuth Client ID + Secret" },
  { value: "service_account", label: "Service Account JSON" },
  { value: "bearer_token", label: "Bearer Token" },
];

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-credentials`;

export function CredentialsTab() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ credential_name: "", provider: "openai", credential_type: "api_key" });
  const [settingValueFor, setSettingValueFor] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
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

  const addCred = async () => {
    if (!form.credential_name || !form.provider) return;
    const { error } = await supabase.from("credentials_meta").insert(form);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ credential_name: "", provider: "openai", credential_type: "api_key" });
      setAdding(false);
      fetchCreds();
    }
  };

  const deleteCred = async (id: string) => {
    await callManageCredentials({ action: "unset", credential_meta_id: id });
    await supabase.from("credentials_meta").delete().eq("id", id);
    fetchCreds();
  };

  const saveSecret = async (credId: string) => {
    if (!secretValue.trim()) return;
    setSaving(true);
    const result = await callManageCredentials({
      action: "set",
      credential_meta_id: credId,
      value: secretValue.trim(),
    });
    setSaving(false);
    if (result.success) {
      toast({ title: "Saved", description: "Credential value stored securely." });
      setSettingValueFor(null);
      setSecretValue("");
      setShowSecret(false);
      fetchCreds();
    } else {
      toast({ title: "Error", description: result.error || "Failed to save", variant: "destructive" });
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Credentials Vault</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Store API keys and OAuth tokens for all your AI providers. Values are stored server-side only.
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
            <input
              placeholder="Name (e.g. OPENAI_KEY)"
              value={form.credential_name}
              onChange={e => setForm(f => ({ ...f, credential_name: e.target.value }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <select
              value={form.provider}
              onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <select
              value={form.credential_type}
              onChange={e => setForm(f => ({ ...f, credential_type: e.target.value }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {CRED_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
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
          <p className="text-xs text-muted-foreground/70 mt-1">Add your provider API keys to enable agent model routing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {creds.map(c => (
            <div key={c.id} className="rounded-lg border border-border bg-secondary/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-medium text-foreground">{c.credential_name}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {PROVIDERS.find(p => p.value === c.provider)?.label || c.provider} · {CRED_TYPES.find(t => t.value === c.credential_type)?.label || c.credential_type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.is_set ? (
                    <span className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono bg-emerald-500/20 text-emerald-400">
                      <CheckCircle className="h-3 w-3" /> Set
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono bg-amber-500/20 text-amber-400">
                      <XCircle className="h-3 w-3" /> Not set
                    </span>
                  )}
                  {c.last_verified_at && (
                    <span className="text-[10px] text-muted-foreground">
                      Verified {new Date(c.last_verified_at).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => { setSettingValueFor(settingValueFor === c.id ? null : c.id); setSecretValue(""); setShowSecret(false); }}
                    className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    {c.is_set ? "Update" : "Set Value"}
                  </button>
                  {c.is_set && (
                    <button
                      onClick={() => testCred(c.id)}
                      disabled={testing === c.id}
                      className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                    >
                      {testing === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                    </button>
                  )}
                  <button onClick={() => deleteCred(c.id)} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {settingValueFor === c.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <div className="relative">
                    {c.credential_type === "service_account" ? (
                      <textarea
                        value={secretValue}
                        onChange={e => setSecretValue(e.target.value)}
                        placeholder="Paste your service account JSON..."
                        rows={4}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    ) : (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showSecret ? "text" : "password"}
                            value={secretValue}
                            onChange={e => setSecretValue(e.target.value)}
                            placeholder={c.credential_type === "oauth_client" ? "client_id:client_secret" : "Paste your API key..."}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 pr-8 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecret(!showSecret)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveSecret(c.id)}
                      disabled={saving || !secretValue.trim()}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Securely"}
                    </button>
                    <button
                      onClick={() => { setSettingValueFor(null); setSecretValue(""); }}
                      className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Value is stored server-side only and never exposed to the frontend.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
