import { useState, useEffect } from "react";
import { Plus, Settings2, Copy, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROVIDERS, type ProviderDef } from "@/lib/provider-config";
import { ProviderWizard } from "@/components/setup/ProviderWizard";

type CredInfo = { id: string; provider: string; credential_name: string; is_set: boolean };
type ModelInfo = { model_id: string; provider: string; is_active: boolean };

export function AISetupPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [creds, setCreds] = useState<CredInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardProvider, setWizardProvider] = useState<ProviderDef | null>(null);
  const [wizardMode, setWizardMode] = useState<"new" | "edit" | "backup">("new");

  const fetch_ = async () => {
    const [cRes, mRes] = await Promise.all([
      supabase.from("credentials_meta").select("id, provider, credential_name, is_set").eq("is_set", true),
      supabase.from("model_registry").select("model_id, provider, is_active"),
    ]);
    setCreds((cRes.data as CredInfo[]) || []);
    setModels((mRes.data as ModelInfo[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const getProviderStatus = (providerKey: string) => {
    const hasCred = creds.some(c => c.provider === providerKey);
    const modelCount = models.filter(m => m.provider === providerKey && m.is_active).length;
    return { hasCred, modelCount };
  };

  if (wizardProvider) {
    return (
      <ProviderWizard
        provider={wizardProvider}
        mode={wizardMode}
        onClose={() => { setWizardProvider(null); fetch_(); }}
      />
    );
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-8">
      {/* Quick Stats */}
      <div className="flex gap-4">
        <button onClick={() => onNavigate("api-keys")} className="flex-1 rounded-lg border border-border bg-secondary/20 p-4 hover:bg-secondary/40 transition-colors text-left">
          <p className="text-2xl font-semibold font-mono text-foreground">{creds.length}</p>
          <p className="text-xs text-muted-foreground mt-1">API Keys configured</p>
        </button>
        <button onClick={() => onNavigate("models")} className="flex-1 rounded-lg border border-border bg-secondary/20 p-4 hover:bg-secondary/40 transition-colors text-left">
          <p className="text-2xl font-semibold font-mono text-foreground">{models.filter(m => m.is_active).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Models enabled</p>
        </button>
        <button onClick={() => onNavigate("budget")} className="flex-1 rounded-lg border border-border bg-secondary/20 p-4 hover:bg-secondary/40 transition-colors text-left">
          <p className="text-2xl font-semibold font-mono text-foreground">{new Set(creds.map(c => c.provider)).size}</p>
          <p className="text-xs text-muted-foreground mt-1">Providers active</p>
        </button>
      </div>

      {/* Provider Grid */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Configure Providers</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {PROVIDERS.map(provider => {
            const status = getProviderStatus(provider.key);
            return (
              <div
                key={provider.key}
                className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{provider.icon}</span>
                    <span className="text-sm font-medium text-foreground">{provider.name}</span>
                  </div>
                  {status.hasCred && (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      <CheckCircle className="h-3 w-3" /> Active
                    </span>
                  )}
                </div>

                {status.hasCred && (
                  <p className="text-[11px] text-muted-foreground mb-3">
                    {status.modelCount} model{status.modelCount !== 1 ? "s" : ""} enabled
                  </p>
                )}

                <div className="flex gap-2">
                  {status.hasCred ? (
                    <>
                      <button
                        onClick={() => { setWizardProvider(provider); setWizardMode("edit"); }}
                        className="flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <Settings2 className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => { setWizardProvider(provider); setWizardMode("backup"); }}
                        className="flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <Copy className="h-3 w-3" /> Backup Key
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setWizardProvider(provider); setWizardMode("new"); }}
                      className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Setup
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
