import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ModelRow = {
  id: string;
  owner_user_id: string | null;
};

function pickClaimableRow(rows: ModelRow[] | null | undefined, userId: string): ModelRow | null {
  if (!rows?.length) return null;
  return rows.find((row) => row.owner_user_id === userId)
    || rows.find((row) => row.owner_user_id === null)
    || null;
}

async function claimModelIfNeeded(supabase: any, id: string, userId: string) {
  const { data: row, error } = await supabase
    .from("model_registry")
    .select("id, owner_user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;
  if (row.owner_user_id && row.owner_user_id !== userId) return null;
  if (row.owner_user_id === userId) return row;

  const { data: claimed, error: claimError } = await supabase
    .from("model_registry")
    .update({ owner_user_id: userId })
    .eq("id", id)
    .is("owner_user_id", null)
    .select("id, owner_user_id")
    .single();

  if (claimError) throw claimError;
  return claimed;
}

async function claimModelByProviderAndId(
  supabase: any,
  provider: string,
  modelId: string,
  userId: string,
) {
  const { data: rows, error } = await supabase
    .from("model_registry")
    .select("id, owner_user_id")
    .eq("provider", provider)
    .eq("model_id", modelId);

  if (error) throw error;
  const claimable = pickClaimableRow(rows || [], userId);
  if (!claimable) return null;
  if (claimable.owner_user_id === userId) return claimable;

  const { data: claimed, error: claimError } = await supabase
    .from("model_registry")
    .update({ owner_user_id: userId })
    .eq("id", claimable.id)
    .is("owner_user_id", null)
    .select("id, owner_user_id")
    .single();

  if (claimError) throw claimError;
  return claimed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await requireUser(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      action,
      id,
      model_id,
      provider,
      display_name,
      model_type,
      config,
      is_active,
      context_window_tokens,
      default_output_tokens,
    } = await req.json();

    if (action === "upsert") {
      if (!model_id || !provider || !display_name) {
        return jsonResponse({ error: "model_id, provider, and display_name are required" }, 400);
      }

      const existing = await claimModelByProviderAndId(supabase, provider, model_id, userId);

      if (existing) {
        const { data: updated, error } = await supabase
          .from("model_registry")
          .update({
            display_name,
            model_type: model_type || "chat",
            config: config ?? null,
            is_active: typeof is_active === "boolean" ? is_active : true,
            context_window_tokens: typeof context_window_tokens === "number" ? context_window_tokens : null,
            default_output_tokens: typeof default_output_tokens === "number" ? default_output_tokens : null,
            owner_user_id: userId,
          })
          .eq("id", existing.id)
          .select("id")
          .single();

        if (error) throw error;
        return jsonResponse({ success: true, id: updated.id });
      }

      const { data: inserted, error } = await supabase
        .from("model_registry")
        .insert({
          model_id,
          provider,
          display_name,
          model_type: model_type || "chat",
          config: config ?? null,
          is_active: typeof is_active === "boolean" ? is_active : true,
          context_window_tokens: typeof context_window_tokens === "number" ? context_window_tokens : null,
          default_output_tokens: typeof default_output_tokens === "number" ? default_output_tokens : null,
          owner_user_id: userId,
        })
        .select("id")
        .single();

      if (error) throw error;
      return jsonResponse({ success: true, id: inserted.id });
    }

    if (action === "set_active") {
      if (!id || typeof is_active !== "boolean") {
        return jsonResponse({ error: "id and is_active are required" }, 400);
      }

      const model = await claimModelIfNeeded(supabase, id, userId);
      if (!model) return jsonResponse({ error: "Model not found." }, 404);

      const { error } = await supabase
        .from("model_registry")
        .update({ is_active, owner_user_id: userId })
        .eq("id", model.id);

      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === "set_active_by_provider_model") {
      if (!provider || !model_id || typeof is_active !== "boolean") {
        return jsonResponse({ error: "provider, model_id, and is_active are required" }, 400);
      }

      const model = await claimModelByProviderAndId(supabase, provider, model_id, userId);
      if (!model) return jsonResponse({ success: true });

      const { error } = await supabase
        .from("model_registry")
        .update({ is_active, owner_user_id: userId })
        .eq("id", model.id);

      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === "delete") {
      if (!id) return jsonResponse({ error: "id is required" }, 400);

      const model = await claimModelIfNeeded(supabase, id, userId);
      if (!model) return jsonResponse({ error: "Model not found." }, 404);

      const { error } = await supabase
        .from("model_registry")
        .delete()
        .eq("id", model.id);

      if (error) throw error;
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("manage-models error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message === "Authentication required." ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
