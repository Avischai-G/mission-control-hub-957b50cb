import { callEdgeJson } from "@/lib/edge-functions";

type ModelPayload = {
  model_id: string;
  provider: string;
  display_name: string;
  model_type?: string;
  config?: Record<string, unknown> | null;
  is_active?: boolean;
  context_window_tokens?: number | null;
  default_output_tokens?: number | null;
};

export async function upsertManagedModel(payload: ModelPayload) {
  return callEdgeJson<{ success: boolean; id: string }>("manage-models", {
    action: "upsert",
    ...payload,
  });
}

export async function setManagedModelActive(id: string, isActive: boolean) {
  return callEdgeJson<{ success: boolean }>("manage-models", {
    action: "set_active",
    id,
    is_active: isActive,
  });
}

export async function setManagedModelActiveByProviderModel(
  provider: string,
  modelId: string,
  isActive: boolean,
) {
  return callEdgeJson<{ success: boolean }>("manage-models", {
    action: "set_active_by_provider_model",
    provider,
    model_id: modelId,
    is_active: isActive,
  });
}

export async function deleteManagedModel(id: string) {
  return callEdgeJson<{ success: boolean }>("manage-models", {
    action: "delete",
    id,
  });
}
