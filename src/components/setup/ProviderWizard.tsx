import { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Loader2, CheckCircle, XCircle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ProviderDef } from "@/lib/provider-config";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-credentials`;

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

type Props = {
  provider: ProviderDef;
  mode: "new" | "edit" | "backup";
  onClose: () => void;
};

export function ProviderWizard({ provider, mode, onClose }: Props) {
  const [step, setStep] = useState(mode === "new" ? 1 : 2); // skip provider select if already chosen
  const [keyName, setKeyName] = useState(
    mode === "backup" ? `${provider.keyNameDefault} (backup)` : provider.keyNameDefault
  );
  const [apiKey, setApiKey] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [credId, setCredId] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [existingModels, setExistingModels] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Load existing models for this provider
  useEffect(() => {
    supabase.from("model_registry").select("model_id").eq("provider", provider.key).eq("is_active", true)
      .then(({ data }) => {
        const ids = new Set((data || []).map((m: any) => m.model_id));
        setExistingModels(ids);
        setSelectedModels(ids);
      });
  }, [provider.key]);

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

  const handleVerifyAndSave = async () => {
    if (!apiKey.trim() || !keyName.trim()) {
      toast({ title: "All fields required", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerifyError("");

    try {
      // Create credential meta
      const masked = maskKey(apiKey.trim());
      const { data, error } = await supabase.from("credentials_meta").insert({
        credential_name: keyName.trim(),
        provider: provider.key,
        credential_type: "api_key",
        is_set: true,
        masked_value: masked,
      }).select("id").single();
      if (error) throw error;

      // Store the actual key
      await callManageCredentials({
        action: "set",
        credential_meta_id: data.id,
        value: apiKey.trim(),
      });

      // Test the key
      const testResult = await callManageCredentials({
        action: "test",
        credential_meta_id: data.id,
      });

      if (testResult.success) {
        setCredId(data.id);
        setVerified(true);
        toast({ title: "✓ API key verified and saved" });
      } else {
        // Delete the failed credential
        await callManageCredentials({ action: "unset", credential_meta_id: data.id });
        await supabase.from("credentials_meta").delete().eq("id", data.id);
        setVerifyError(testResult.error || "Key verification failed");
      }
    } catch (e: any) {
      setVerifyError(e.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleEditKey = async () => {
    if (!apiKey.trim()) return;
    setVerifying(true);
    setVerifyError("");

    try {
      // Find existing credential for this provider
      const { data: existingCreds } = await supabase.from("credentials_meta")
        .select("id").eq("provider", provider.key).eq("is_set", true).limit(1);
      const existingId = existingCreds?.[0]?.id;
      if (!existingId) throw new Error("No existing credential found");

      const masked = maskKey(apiKey.trim());
      await callManageCredentials({ action: "set", credential_meta_id: existingId, value: apiKey.trim() });
      await supabase.from("credentials_meta").update({ masked_value: masked }).eq("id", existingId);

      const testResult = await callManageCredentials({ action: "test", credential_meta_id: existingId });
      if (testResult.success) {
        setCredId(existingId);
        setVerified(true);
        toast({ title: "✓ API key updated and verified" });
      } else {
        setVerifyError(testResult.error || "Key verification failed");
      }
    } catch (e: any) {
      setVerifyError(e.message);
    } finally {
      setVerifying(false);
    }
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      // Add new models
      const toAdd = [...selectedModels].filter(id => !existingModels.has(id));
      const toRemove = [...existingModels].filter(id => !selectedModels.has(id));

      for (const modelId of toAdd) {
        const modelDef = provider.models.find(m => m.id === modelId);
        await supabase.from("model_registry").insert({
          model_id: modelId,
          provider: provider.key,
          display_name: modelDef?.name || modelId,
          model_type: "chat",
          config: credId ? { credential_id: credId } : {},
        });

        // Also add to catalog with pricing
        if (modelDef) {
          await supabase.from("provider_models_catalog" as any).upsert({
            provider: provider.key,
            model_id: modelId,
            display_name: modelDef.name,
            input_price_per_1m: modelDef.inputPer1M,
            output_price_per_1m: modelDef.outputPer1M,
          }, { onConflict: "provider,model_id" });
        }
      }

      // Deactivate removed models
      for (const modelId of toRemove) {
        await supabase.from("model_registry").update({ is_active: false }).eq("model_id", modelId).eq("provider", provider.key);
      }

      toast({ title: "Setup complete", description: `${provider.name} configured with ${selectedModels.size} models.` });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-xl">{provider.icon}</span>
        <h3 className="font-display text-lg font-semibold text-foreground">{provider.name} Setup</h3>
        <span className="text-xs text-muted-foreground ml-auto">Step {step === 1 ? 1 : step === 2 ? 2 : 3} of 3</span>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-secondary"}`} />
        ))}
      </div>

      {/* Step 1: Provider info (only for new) */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/20 p-6 text-center">
            <span className="text-4xl mb-4 block">{provider.icon}</span>
            <h4 className="text-lg font-semibold text-foreground">{provider.name}</h4>
            <p className="text-sm text-muted-foreground mt-2">
              {provider.models.length} models available • Pricing from ${Math.min(...provider.models.map(m => m.inputPer1M)).toFixed(2)}/1M tokens
            </p>
          </div>
          <button
            onClick={() => setStep(2)}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Continue to API Key Setup <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Step 2: API Key */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-secondary/10 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-foreground font-medium">
                  Go to the{" "}
                  <a href={provider.apiKeyUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    API key section <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{provider.apiKeyInstructions}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Key Name</label>
              <input
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                placeholder={provider.keyNameDefault}
                className={inputCls + " w-full"}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setVerified(false); setVerifyError(""); }}
                placeholder={provider.keyPrefix ? `${provider.keyPrefix}...` : "Paste your API key"}
                className={inputCls + " w-full font-mono"}
              />
            </div>
          </div>

          {verifyError && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <XCircle className="h-4 w-4 shrink-0" /> {verifyError}
            </div>
          )}

          {verified && (
            <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 rounded-md px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0" /> API key verified and saved securely
            </div>
          )}

          <div className="flex gap-3">
            {mode === "new" && (
              <button onClick={() => setStep(1)} className="rounded-md bg-secondary px-4 py-2.5 text-sm text-secondary-foreground hover:bg-secondary/80">
                Back
              </button>
            )}
            {!verified ? (
              <button
                onClick={mode === "edit" ? handleEditKey : handleVerifyAndSave}
                disabled={verifying || !apiKey.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Verify & Save API Key
              </button>
            ) : (
              <button
                onClick={() => setStep(3)}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Select Models <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Model Selection */}
      {step === 3 && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Select which models to enable for {provider.name}. You can change this later.
          </p>

          <div className="space-y-2 max-h-[400px] overflow-auto">
            {provider.models.map(model => (
              <label
                key={model.id}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                  selectedModels.has(model.id)
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedModels.has(model.id)}
                  onChange={() => toggleModel(model.id)}
                  className="rounded border-border text-primary focus:ring-primary/50 h-4 w-4"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">{model.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{model.id}</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground font-mono">
                    ${model.inputPer1M}/1M in • ${model.outputPer1M}/1M out
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="rounded-md bg-secondary px-4 py-2.5 text-sm text-secondary-foreground hover:bg-secondary/80">
              Back
            </button>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add {selectedModels.size} Model{selectedModels.size !== 1 ? "s" : ""} & Finish Setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
