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
  const openRouterProvider = PROVIDERS.find(provider => provider.key === "openrouter") || null;
  const providerCards = PROVIDERS.filter(provider => provider.key !== "openrouter");

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
        <div className="flex flex-col gap-2">
          {openRouterProvider && (() => {
            const status = getProviderStatus(openRouterProvider.key);
            return (
              <div
                key={`${openRouterProvider.key}-free`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 hover:border-primary/50 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-[240px] flex-1">
                  <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border border-primary/20">
                    {openRouterProvider.icon}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">OpenRouter</span>
                      <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                        Route
                      </span>
                      {status.hasCred && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                          <CheckCircle className="h-3 w-3" /> Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Use free and paid OpenRouter models, including Grok live-search variants such as <span className="font-mono">x-ai/grok-4.1-fast:online</span>.
                    </p>
                    {status.hasCred && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {status.modelCount} model{status.modelCount !== 1 ? "s" : ""} enabled
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto ml-[52px] sm:ml-0">
                  {status.hasCred ? (
                    <>
                      <button
                        onClick={() => { setWizardProvider(openRouterProvider); setWizardMode("edit"); }}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <Settings2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => { setWizardProvider(openRouterProvider); setWizardMode("backup"); }}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" /> Backup Key
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setWizardProvider(openRouterProvider); setWizardMode("new"); }}
                      className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Setup OpenRouter
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {providerCards.map(provider => {
            const status = getProviderStatus(provider.key);
            return (
              <div
                key={provider.key}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-[240px] flex-1">
                  <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-secondary/30 border border-border/50">
                    {provider.icon}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{provider.name}</span>
                      {status.hasCred && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                          <CheckCircle className="h-3 w-3" /> Active
                        </span>
                      )}
                    </div>
                    {status.hasCred && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {status.modelCount} model{status.modelCount !== 1 ? "s" : ""} enabled
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto ml-[52px] sm:ml-0">
                  {status.hasCred ? (
                    <>
                      <button
                        onClick={() => { setWizardProvider(provider); setWizardMode("edit"); }}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <Settings2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => { setWizardProvider(provider); setWizardMode("backup"); }}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" /> Backup Key
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setWizardProvider(provider); setWizardMode("new"); }}
                      className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Setup
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
