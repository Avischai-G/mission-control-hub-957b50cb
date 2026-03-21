import { useState, useEffect } from "react";
import { Key, Trash2, Loader2, CheckCircle, XCircle, FlaskConical, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeJson } from "@/lib/edge-functions";
import { useToast } from "@/hooks/use-toast";
import { PROVIDERS } from "@/lib/provider-config";

type Cred = {
  id: string;
  credential_name: string;
  provider: string;
  is_set: boolean;
  masked_value: string | null;
  last_verified_at: string | null;
};

export function APIKeysPage() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateValue, setUpdateValue] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchCreds = async () => {
    const { data } = await supabase.from("credentials_meta").select("*").order("created_at", { ascending: false });
    setCreds((data as Cred[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCreds(); }, []);

  const callFn = async (body: Record<string, unknown>) => {
    return callEdgeJson<Record<string, any>>("manage-credentials", body);
  };

  const testCred = async (id: string) => {
    setTesting(id);
    try {
      const result = await callFn({ action: "test", credential_meta_id: id });
      if (result.success) {
        toast({ title: "✓ Valid", description: "Credential verified." });
        fetchCreds();
      } else {
        toast({ title: "✗ Invalid", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "✗ Invalid", description: e.message, variant: "destructive" });
    }
    setTesting(null);
  };

  const deleteCred = async (id: string) => {
    try {
      await callFn({ action: "unset", credential_meta_id: id });
      await supabase.from("credentials_meta").delete().eq("id", id);
      fetchCreds();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const updateKey = async (id: string) => {
    if (!updateValue.trim()) return;
    setSaving(true);
    try {
      const masked = updateValue.length > 8 ? updateValue.slice(0, 4) + "••••••••" + updateValue.slice(-4) : "••••••••";
      const result = await callFn({ action: "set", credential_meta_id: id, value: updateValue.trim() });
      if (result.success) {
        await supabase.from("credentials_meta").update({ masked_value: masked }).eq("id", id);
        toast({ title: "Updated" });
        setUpdatingId(null);
        setUpdateValue("");
        fetchCreds();
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (creds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <Key className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No API keys registered yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Go to AI Setup to add your first provider.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">All registered API keys across providers.</p>
      {creds.map(c => {
        const providerDef = PROVIDERS.find(p => p.key === c.provider);
        return (
          <div key={c.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg">{providerDef?.icon || "🔑"}</span>
                <div>
                  <span className="text-sm font-medium text-foreground">{c.credential_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{providerDef?.name || c.provider}</span>
                </div>
                {c.masked_value && (
                  <span className="font-mono text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{c.masked_value}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {c.is_set ? (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-primary"><CheckCircle className="h-3 w-3" /> Set</span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground"><XCircle className="h-3 w-3" /> Not set</span>
                )}
                {c.last_verified_at && <span className="text-[10px] text-muted-foreground">Verified {new Date(c.last_verified_at).toLocaleDateString()}</span>}
                <button onClick={() => setUpdatingId(updatingId === c.id ? null : c.id)} className="rounded-md bg-secondary px-2 py-1 text-[10px] text-secondary-foreground hover:bg-secondary/80"><RefreshCw className="h-3 w-3" /></button>
                <button onClick={() => testCred(c.id)} disabled={testing === c.id} className="rounded-md bg-secondary px-2 py-1 text-[10px] text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50">
                  {testing === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                </button>
                <button onClick={() => deleteCred(c.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {updatingId === c.id && (
              <div className="mt-3 pt-3 border-t border-border flex gap-2">
                <input type="password" value={updateValue} onChange={e => setUpdateValue(e.target.value)} placeholder="Paste new key..." className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
                <button onClick={() => updateKey(c.id)} disabled={saving} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">{saving ? "..." : "Update"}</button>
                <button onClick={() => { setUpdatingId(null); setUpdateValue(""); }} className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">Cancel</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
