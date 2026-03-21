import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ExternalLink,
  Loader2,
  Plus,
  Shield,
  Trash2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeJson } from "@/lib/edge-functions";
import {
  setManagedModelActiveByProviderModel,
  upsertManagedModel,
} from "@/lib/model-registry";
import {
  buildProviderModelDisplayName,
  type ProviderDef,
} from "@/lib/provider-config";
import { useToast } from "@/hooks/use-toast";

type Props = {
  provider: ProviderDef;
  mode: "new" | "edit" | "backup";
  onClose: () => void;
};

type ExistingModelRow = {
  model_id: string;
  display_name: string | null;
  config: Record<string, unknown> | null;
};

type VerifyModelResult = {
  success: boolean;
  error?: string;
  suggested_model_id?: string;
  suggested_model_name?: string;
  suggestion_source?: string;
};

type ManageCredentialsResponse = {
  success?: boolean;
  error?: string;
};

type CustomModelDraft = {
  key: string;
  modelId: string;
  displayName: string;
  credentialId: string;
  verified: boolean | null;
  verifying: boolean;
  error: string;
  suggestion: {
    modelId: string;
    displayName: string;
    source: string;
  } | null;
};

type DesiredModel = {
  modelId: string;
  displayName: string;
  credentialId: string;
  modelDef?: ProviderDef["models"][number];
  source: "curated" | "custom";
};

type CredentialOption = {
  id: string;
  name: string;
};

type ProviderCredentialRow = {
  id: string;
  credential_name: string;
};

function maskKey(key: string) {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

function createCustomModelDraft(initial?: Partial<CustomModelDraft>): CustomModelDraft {
  return {
    key: initial?.key || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    modelId: initial?.modelId || "",
    displayName: initial?.displayName || "",
    credentialId: initial?.credentialId || "",
    verified: initial?.verified ?? null,
    verifying: initial?.verifying ?? false,
    error: initial?.error || "",
    suggestion: initial?.suggestion || null,
  };
}

function suggestionSourceLabel(source: string) {
  return source === "grok" ? "Grok" : "catalog";
}

function getLinkedCredentialId(config: Record<string, unknown> | null | undefined) {
  const credentialId = config?.credential_id;
  return typeof credentialId === "string" && credentialId.length > 0 ? credentialId : "";
}

export function ProviderWizard({ provider, mode, onClose }: Props) {
  const [step, setStep] = useState(mode === "edit" ? 3 : mode === "new" ? 1 : 2);
  const [keyName, setKeyName] = useState(
    mode === "backup" ? `${provider.keyNameDefault} (backup)` : provider.keyNameDefault,
  );
  const [apiKey, setApiKey] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [credId, setCredId] = useState<string | null>(null);
  const [existingCredentialId, setExistingCredentialId] = useState<string | null>(null);
  const [existingCredentialName, setExistingCredentialName] = useState<string>("");
  const [providerCredentials, setProviderCredentials] = useState<CredentialOption[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [curatedAssignments, setCuratedAssignments] = useState<Record<string, string>>({});
  const [existingModels, setExistingModels] = useState<Set<string>>(new Set());
  const [customModels, setCustomModels] = useState<CustomModelDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setStep(mode === "edit" ? 3 : mode === "new" ? 1 : 2);
    setKeyName(mode === "backup" ? `${provider.keyNameDefault} (backup)` : provider.keyNameDefault);
    setApiKey("");
    setVerifying(false);
    setVerified(false);
    setVerifyError("");
    setCredId(null);
    setExistingCredentialId(null);
    setExistingCredentialName("");
    setProviderCredentials([]);
    setSelectedModels(new Set());
    setCuratedAssignments({});
    setExistingModels(new Set());
    setCustomModels([]);
  }, [mode, provider.key, provider.keyNameDefault]);

  useEffect(() => {
    const curatedIds = new Set(provider.models.map((model) => model.id));
    let cancelled = false;

    Promise.all([
      supabase
        .from("model_registry")
        .select("model_id, display_name, config")
        .eq("provider", provider.key)
        .eq("is_active", true),
      supabase
        .from("credentials_meta")
        .select("id, credential_name")
        .eq("provider", provider.key)
        .eq("is_set", true)
        .order("created_at", { ascending: false }),
    ]).then(([modelsResult, credentialResult]) => {
      if (cancelled) return;

      const rows = ((modelsResult.data as ExistingModelRow[] | null) || []);
      const credentials = ((credentialResult.data as ProviderCredentialRow[] | null) || []).map((credential) => ({
        id: credential.id,
        name: credential.credential_name || "API Key",
      }));
      const primaryCredentialId = credentials[0]?.id || "";
      const activeIds = new Set(rows.map((row) => row.model_id));
      const curatedRows = rows.filter((row) => curatedIds.has(row.model_id));

      setProviderCredentials(credentials);
      setExistingModels(activeIds);
      setSelectedModels(new Set(curatedRows.map((row) => row.model_id)));
      setCuratedAssignments(
        Object.fromEntries(
          curatedRows.map((row) => [
            row.model_id,
            getLinkedCredentialId(row.config) || primaryCredentialId,
          ]),
        ),
      );
      setCustomModels(
        rows
          .filter((row) => !curatedIds.has(row.model_id))
          .map((row) =>
            createCustomModelDraft({
              modelId: row.model_id,
              displayName: row.display_name || "",
              credentialId: getLinkedCredentialId(row.config) || primaryCredentialId,
              verified: true,
            }),
          ),
      );

      const activeCredential = credentials[0];
      setExistingCredentialId(activeCredential?.id || null);
      setExistingCredentialName(activeCredential?.name || "");
    });

    return () => {
      cancelled = true;
    };
  }, [provider.key, provider.models]);

  const callManageCredentials = async (body: Record<string, unknown>) => {
    return callEdgeJson<ManageCredentialsResponse>("manage-credentials", body);
  };

  const updateCustomModel = (draftKey: string, patch: Partial<CustomModelDraft>) => {
    setCustomModels((current) =>
      current.map((draft) => (draft.key === draftKey ? { ...draft, ...patch } : draft)),
    );
  };

  const updateCuratedAssignment = (modelId: string, credentialId: string) => {
    setCuratedAssignments((current) => ({ ...current, [modelId]: credentialId }));
  };

  const getPreferredCredentialId = (override?: string | null) => {
    if (override) return override;
    if (credId) return credId;
    if (existingCredentialId) return existingCredentialId;
    return providerCredentials[0]?.id || "";
  };

  const addCredentialOption = (credential: CredentialOption) => {
    setProviderCredentials((current) => {
      const next = [credential, ...current.filter((entry) => entry.id !== credential.id)];
      return next;
    });
  };

  const resolveActiveCredentialId = async () => {
    if (credId) return credId;
    if (existingCredentialId) return existingCredentialId;

    const { data: existingCredential } = await supabase
      .from("credentials_meta")
      .select("id, credential_name")
      .eq("provider", provider.key)
      .eq("is_set", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCredential?.id) {
      setExistingCredentialId(existingCredential.id);
      setExistingCredentialName(existingCredential.credential_name || "");
      addCredentialOption({ id: existingCredential.id, name: existingCredential.credential_name || "API Key" });
      return existingCredential.id;
    }

    return null;
  };

  const verifyStoredKey = async (credentialMetaId: string) => {
    const testResult = await callManageCredentials({
      action: "test",
      credential_meta_id: credentialMetaId,
    });

    if (!testResult.success) {
      throw new Error(testResult.error || "Key verification failed");
    }
  };

  const handleVerifyAndSave = async () => {
    if (!apiKey.trim() || !keyName.trim()) {
      toast({ title: "All fields required", variant: "destructive" });
      return;
    }

    setVerifying(true);
    setVerifyError("");
    let insertedCredentialId: string | null = null;

    try {
      const masked = maskKey(apiKey.trim());
      const { data, error } = await supabase
        .from("credentials_meta")
        .insert({
          credential_name: keyName.trim(),
          provider: provider.key,
          credential_type: "api_key",
          is_set: true,
          masked_value: masked,
        })
        .select("id")
        .single();

      if (error) throw error;
      insertedCredentialId = data.id;

      await callManageCredentials({
        action: "set",
        credential_meta_id: data.id,
        value: apiKey.trim(),
      });

      await verifyStoredKey(data.id);

      setCredId(data.id);
      addCredentialOption({ id: data.id, name: keyName.trim() });
      if (!existingCredentialId) {
        setExistingCredentialId(data.id);
        setExistingCredentialName(keyName.trim());
      }
      setVerified(true);
      toast({ title: "API key verified and saved" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Key verification failed";
      if (insertedCredentialId) {
        await callManageCredentials({
          action: "unset",
          credential_meta_id: insertedCredentialId,
        }).catch(() => undefined);
        await supabase
          .from("credentials_meta")
          .delete()
          .eq("id", insertedCredentialId);
      }
      setVerifyError(message);
      toast({ title: "Unable to save key", description: message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const handleEditKey = async () => {
    if (!apiKey.trim()) return;

    setVerifying(true);
    setVerifyError("");

    try {
      const activeCredentialId = await resolveActiveCredentialId();
      if (!activeCredentialId) throw new Error("No existing credential found");

      const masked = maskKey(apiKey.trim());
      await callManageCredentials({
        action: "set",
        credential_meta_id: activeCredentialId,
        value: apiKey.trim(),
      });
      await supabase
        .from("credentials_meta")
        .update({ masked_value: masked })
        .eq("id", activeCredentialId);

      await verifyStoredKey(activeCredentialId);

      setCredId(activeCredentialId);
      setExistingCredentialId(activeCredentialId);
      addCredentialOption({ id: activeCredentialId, name: existingCredentialName || provider.keyNameDefault });
      setVerified(true);
      toast({ title: "API key updated and verified" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Key verification failed";
      setVerifyError(message);
      toast({ title: "Unable to update key", description: message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
    setCuratedAssignments((current) => {
      if (current[modelId]) return current;
      const credentialId = getPreferredCredentialId();
      return credentialId ? { ...current, [modelId]: credentialId } : current;
    });
  };

  const verifyCustomModel = async (draftKey: string, draftOverride?: CustomModelDraft) => {
    const draft = draftOverride || customModels.find((entry) => entry.key === draftKey);
    if (!draft) return;

    const activeCredentialId = draft.credentialId || getPreferredCredentialId(await resolveActiveCredentialId());
    if (!activeCredentialId) {
      toast({
        title: "No credential available",
        description: `Add or keep a ${provider.name} key before verifying models.`,
        variant: "destructive",
      });
      return;
    }

    const modelId = draft.modelId.trim();
    if (!modelId) {
      toast({
        title: "Model ID required",
        description: "Enter a model ID before verifying.",
        variant: "destructive",
      });
      return;
    }

    updateCustomModel(draftKey, {
      verifying: true,
      verified: null,
      error: "",
      suggestion: null,
    });

    try {
      const result = await callEdgeJson<VerifyModelResult>("manage-credentials", {
        action: "verify_model",
        credential_meta_id: activeCredentialId,
        model_id: modelId,
      });

      updateCustomModel(draftKey, {
        verifying: false,
        verified: result.success,
        error: result.success ? "" : result.error || "Verification failed",
        suggestion: result.success || !result.suggested_model_id
          ? null
          : {
              modelId: result.suggested_model_id,
              displayName: result.suggested_model_name || "",
              source: result.suggestion_source || "catalog",
            },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      updateCustomModel(draftKey, {
        verifying: false,
        verified: false,
        error: message,
        suggestion: null,
      });
    }
  };

  const applySuggestedModel = async (draftKey: string) => {
    const currentDraft = customModels.find((entry) => entry.key === draftKey);
    if (!currentDraft?.suggestion) return;

    const nextDraft: CustomModelDraft = {
      ...currentDraft,
      modelId: currentDraft.suggestion.modelId,
      displayName:
        currentDraft.displayName.trim() ||
        buildProviderModelDisplayName(
          provider.key,
          currentDraft.suggestion.modelId,
          currentDraft.suggestion.displayName,
        ),
      verified: null,
      verifying: false,
      error: "",
      suggestion: null,
    };

    setCustomModels((current) =>
      current.map((draft) => (draft.key === draftKey ? nextDraft : draft)),
    );

    await verifyCustomModel(draftKey, nextDraft);
  };

  const handleFinish = async () => {
    setSaving(true);

    try {
      if (!activeCredentialReady) {
        throw new Error(`No verified ${provider.name} credential found.`);
      }

      const manualModels = customModels.filter((draft) => draft.modelId.trim());
      const unverifiedCustom = manualModels.find((draft) => draft.verified !== true);
      if (unverifiedCustom) {
        throw new Error(`Verify custom model "${unverifiedCustom.modelId}" before finishing.`);
      }

      const desiredModels = new Map<string, DesiredModel>();

      for (const modelId of selectedModels) {
        const modelDef = provider.models.find((model) => model.id === modelId);
        if (!modelDef) continue;
        const credentialId = curatedAssignments[modelId] || getPreferredCredentialId();
        if (!credentialId) {
          throw new Error(`Choose an API key for "${modelDef.name}".`);
        }

        desiredModels.set(modelId, {
          modelId,
          displayName: buildProviderModelDisplayName(provider.key, modelId, modelDef.name),
          credentialId,
          modelDef,
          source: "curated",
        });
      }

      for (const draft of manualModels) {
        const credentialId = draft.credentialId || getPreferredCredentialId();
        if (!credentialId) {
          throw new Error(`Choose an API key for "${draft.modelId}".`);
        }
        desiredModels.set(draft.modelId.trim(), {
          modelId: draft.modelId.trim(),
          displayName:
            draft.displayName.trim() ||
            buildProviderModelDisplayName(provider.key, draft.modelId, null),
          credentialId,
          source: "custom",
        });
      }

      const verifiedModels = new Map<string, DesiredModel>();
      const skippedModels: string[] = [];

      for (const desiredModel of desiredModels.values()) {
        if (desiredModel.source === "custom") {
          verifiedModels.set(desiredModel.modelId, desiredModel);
          continue;
        }

        const verifyResult = await callEdgeJson<VerifyModelResult>("manage-credentials", {
          action: "verify_model",
          credential_meta_id: desiredModel.credentialId,
          model_id: desiredModel.modelId,
        });

        if (verifyResult.success) {
          verifiedModels.set(desiredModel.modelId, desiredModel);
        } else {
          skippedModels.push(desiredModel.modelId);
        }
      }

      for (const verifiedModel of verifiedModels.values()) {
        await upsertManagedModel({
          model_id: verifiedModel.modelId,
          provider: provider.key,
          display_name: verifiedModel.displayName,
          model_type: "chat",
          config: { credential_id: verifiedModel.credentialId },
          is_active: true,
        });

        if (verifiedModel.modelDef) {
          await supabase.from("provider_models_catalog").upsert(
            {
              provider: provider.key,
              model_id: verifiedModel.modelId,
              display_name: verifiedModel.displayName,
              input_price_per_1m: verifiedModel.modelDef.inputPer1M,
              output_price_per_1m: verifiedModel.modelDef.outputPer1M,
            },
            { onConflict: "provider,model_id" },
          );
        }
      }

      const verifiedIds = new Set(verifiedModels.keys());
      const toRemove = [...existingModels].filter((modelId) => !verifiedIds.has(modelId));

      for (const modelId of toRemove) {
        await setManagedModelActiveByProviderModel(provider.key, modelId, false);
      }

      const skippedSuffix = skippedModels.length
        ? ` Skipped unsupported models: ${skippedModels.join(", ")}.`
        : "";

      toast({
        title: "Setup complete",
        description: `${provider.name} configured with ${verifiedModels.size} active models.${skippedSuffix}`,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save provider configuration.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = selectedModels.size + customModels.filter((draft) => draft.modelId.trim()).length;
  const activeCredentialReady = providerCredentials.length > 0 || Boolean(credId || existingCredentialId);
  const inputCls = "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-xl">{provider.icon}</span>
        <h3 className="font-display text-lg font-semibold text-foreground">{provider.name} Setup</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          Step {step === 1 ? 1 : step === 2 ? 2 : 3} of 3
        </span>
      </div>

      <div className="flex gap-1">
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full transition-colors ${index <= step ? "bg-primary" : "bg-secondary"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/20 p-6 text-center">
            <span className="text-4xl mb-4 block">{provider.icon}</span>
            <h4 className="text-lg font-semibold text-foreground">{provider.name}</h4>
            <p className="text-sm text-muted-foreground mt-2">
              {provider.models.length} curated models available. You can also add a custom model ID later.
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

      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-secondary/10 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-foreground font-medium">
                  Go to the{" "}
                  <a
                    href={provider.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    API key section <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{provider.apiKeyInstructions}</p>
              </div>
            </div>
          </div>

          {mode === "edit" && activeCredentialReady && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Stored key{providerCredentials.length !== 1 ? "s are" : " is"} already available
              {existingCredentialName ? `, including "${existingCredentialName}"` : ""}.
              Leave the API key field empty to keep the current keys and edit model assignments only.
            </div>
          )}

          <div className="space-y-3">
            {mode !== "edit" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Key Name</label>
                <input
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
                  placeholder={provider.keyNameDefault}
                  className={`${inputCls} w-full`}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                API Key{mode === "edit" ? " (optional)" : ""}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setVerified(false);
                  setVerifyError("");
                }}
                placeholder={provider.keyPrefix ? `${provider.keyPrefix}...` : "Paste your API key"}
                className={`${inputCls} w-full font-mono`}
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

          <div className="flex flex-wrap gap-3">
            {mode === "new" && (
              <button
                onClick={() => setStep(1)}
                className="rounded-md bg-secondary px-4 py-2.5 text-sm text-secondary-foreground hover:bg-secondary/80"
              >
                Back
              </button>
            )}

            {mode === "edit" && activeCredentialReady && !verified && (
              <button
                onClick={() => setStep(3)}
                className="rounded-md bg-secondary px-4 py-2.5 text-sm text-secondary-foreground hover:bg-secondary/80"
              >
                Keep Current Key
              </button>
            )}

            {!verified ? (
              <button
                onClick={mode === "edit" ? handleEditKey : handleVerifyAndSave}
                disabled={verifying || !apiKey.trim()}
                className="flex-1 min-w-[220px] flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === "edit" ? "Verify New API Key" : "Verify & Save API Key"}
              </button>
            ) : (
              <button
                onClick={() => setStep(3)}
                className="flex-1 min-w-[220px] flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Continue to Models <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Enable curated models or add your own model ID. Each model can be assigned to a different API key.
              </p>
              {provider.key === "openrouter" && (
                <p className="text-xs text-muted-foreground mt-1">
                  For live research, try <span className="font-mono text-foreground">x-ai/grok-4.1-fast:online</span> or{" "}
                  <span className="font-mono text-foreground">x-ai/grok-4.20-beta:online</span>. You can keep a free-key pool and a paid-key pool by assigning models to different OpenRouter credentials here.
                </p>
              )}
            </div>
            {!activeCredentialReady && (
              <button
                onClick={() => setStep(2)}
                className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground hover:bg-secondary/80"
              >
                Add API Key First
              </button>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">Available API keys</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Pick which credential each model should use. This is what makes backup keys model-specific.
              </p>
            </div>
            {providerCredentials.length === 0 ? (
              <p className="text-xs text-muted-foreground">No verified keys available yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {providerCredentials.map((credential) => (
                  <div
                    key={credential.id}
                    className={`rounded-md border px-3 py-2 text-xs ${
                      credId === credential.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary/30 text-muted-foreground"
                    }`}
                  >
                    <span className="font-medium text-foreground">{credential.name}</span>
                    {credId === credential.id && <span className="ml-2 text-primary">new</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-foreground">Custom model IDs</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Use this for new releases that are not in the curated list yet.
                </p>
              </div>
              <button
                onClick={() =>
                  setCustomModels((current) => [
                    ...current,
                    createCustomModelDraft({ credentialId: getPreferredCredentialId() }),
                  ])
                }
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Custom Model
              </button>
            </div>

            {customModels.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom models added yet.</p>
            ) : (
              <div className="space-y-3">
                {customModels.map((draft) => (
                  <div key={draft.key} className="rounded-lg border border-border bg-card p-3 space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Model ID
                        </label>
                        <input
                          value={draft.modelId}
                          onChange={(event) =>
                            updateCustomModel(draft.key, {
                              modelId: event.target.value,
                              verified: null,
                              error: "",
                              suggestion: null,
                            })
                          }
                          placeholder={provider.key === "openrouter" ? "e.g. x-ai/grok-4.1-fast:online" : "Paste a provider model ID"}
                          className={`${inputCls} w-full font-mono`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Display Name
                        </label>
                        <input
                          value={draft.displayName}
                          onChange={(event) => updateCustomModel(draft.key, { displayName: event.target.value })}
                          placeholder="Optional"
                          className={`${inputCls} w-full`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          API Key
                        </label>
                        <select
                          value={draft.credentialId}
                          onChange={(event) =>
                            updateCustomModel(draft.key, {
                              credentialId: event.target.value,
                              verified: null,
                              error: "",
                              suggestion: null,
                            })
                          }
                          className={`${inputCls} w-full`}
                        >
                          <option value="">Select API key</option>
                          {providerCredentials.map((credential) => (
                            <option key={credential.id} value={credential.id}>
                              {credential.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-end gap-2">
                        <button
                          onClick={() => void verifyCustomModel(draft.key)}
                          disabled={draft.verifying || !draft.modelId.trim() || !draft.credentialId}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                        >
                          {draft.verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Verify
                        </button>
                        <button
                          onClick={() => setCustomModels((current) => current.filter((entry) => entry.key !== draft.key))}
                          className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {draft.verified === true && (
                      <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 rounded-md px-3 py-2">
                        <CheckCircle className="h-4 w-4 shrink-0" /> Connection verified
                      </div>
                    )}

                    {draft.verified === false && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                          <XCircle className="h-4 w-4 shrink-0" /> {draft.error}
                        </div>

                        {draft.suggestion && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                            <span>
                              Suggested by {suggestionSourceLabel(draft.suggestion.source)}:
                            </span>
                            <span className="font-mono text-foreground break-all">
                              {draft.suggestion.modelId}
                            </span>
                            <button
                              onClick={() => void applySuggestedModel(draft.key)}
                              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              Use Suggestion
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 max-h-[420px] overflow-auto">
            {provider.models.map((model) => (
              <div
                key={model.id}
                className={`rounded-lg border p-3 transition-all ${
                  selectedModels.has(model.id)
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedModels.has(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="mt-0.5 rounded border-border text-primary focus:ring-primary/50 h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{model.name}</span>
                      <span className="text-xs text-muted-foreground font-mono break-all">{model.id}</span>
                    </div>
                    {model.bestFor && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Best for: <span className="text-foreground/80">{model.bestFor}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right min-w-[120px]">
                    <p className="text-[10px] text-muted-foreground font-mono">
                      ${model.inputPer1M}/1M in • ${model.outputPer1M}/1M out
                    </p>
                  </div>
                </div>
                {selectedModels.has(model.id) ? (
                  <div className="mt-3 pl-7">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      API Key
                    </label>
                    <select
                      value={curatedAssignments[model.id] || ""}
                      onChange={(event) => updateCuratedAssignment(model.id, event.target.value)}
                      className={`${inputCls} w-full max-w-[280px]`}
                    >
                      <option value="">Select API key</option>
                      {providerCredentials.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {credential.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setStep(2)}
              className="rounded-md bg-secondary px-4 py-2.5 text-sm text-secondary-foreground hover:bg-secondary/80"
            >
              {mode === "edit" ? "API Key" : "Back"}
            </button>
            <button
              onClick={handleFinish}
              disabled={saving || !activeCredentialReady}
              className="flex-1 min-w-[220px] flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save {selectedCount} Model{selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
