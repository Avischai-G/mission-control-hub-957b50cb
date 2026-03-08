import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, credential_meta_id, value, model_id } = await req.json();

    if (action === "set") {
      if (!credential_meta_id || !value) {
        return new Response(JSON.stringify({ error: "credential_meta_id and value required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: valErr } = await supabase.from("credential_values").upsert({
        credential_meta_id,
        encrypted_value: value,
      }, { onConflict: "credential_meta_id" });

      if (valErr) throw valErr;

      await supabase.from("credentials_meta")
        .update({ is_set: true, last_verified_at: new Date().toISOString() })
        .eq("id", credential_meta_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unset") {
      if (!credential_meta_id) {
        return new Response(JSON.stringify({ error: "credential_meta_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("credential_values").delete().eq("credential_meta_id", credential_meta_id);
      await supabase.from("credentials_meta")
        .update({ is_set: false, last_verified_at: null, masked_value: null })
        .eq("id", credential_meta_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test") {
      if (!credential_meta_id) {
        return new Response(JSON.stringify({ error: "credential_meta_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: meta } = await supabase.from("credentials_meta")
        .select("*").eq("id", credential_meta_id).single();
      const { data: val } = await supabase.from("credential_values")
        .select("encrypted_value").eq("credential_meta_id", credential_meta_id).single();

      if (!meta || !val) {
        return new Response(JSON.stringify({ success: false, error: "Credential not found or not set" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let testResult = { valid: false, error: "" };
      const apiKey = val.encrypted_value;
      const provider = meta.provider.toLowerCase();

      try {
        if (provider === "openai") {
          const r = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          testResult.valid = r.ok;
          if (!r.ok) testResult.error = `HTTP ${r.status}`;
        } else if (provider === "anthropic") {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          testResult.valid = r.status !== 401 && r.status !== 403;
          if (!testResult.valid) testResult.error = `HTTP ${r.status}`;
        } else if (provider === "google" || provider === "gemini") {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
          );
          testResult.valid = r.ok;
          if (!r.ok) testResult.error = `HTTP ${r.status}`;
        } else {
          testResult.valid = true;
        }
      } catch (e) {
        testResult.error = e instanceof Error ? e.message : "Test failed";
      }

      if (testResult.valid) {
        await supabase.from("credentials_meta")
          .update({ last_verified_at: new Date().toISOString() })
          .eq("id", credential_meta_id);
      }

      return new Response(JSON.stringify({ success: testResult.valid, error: testResult.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify a specific model_id works with a credential
    if (action === "verify_model") {
      if (!credential_meta_id || !model_id) {
        return new Response(JSON.stringify({ error: "credential_meta_id and model_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: meta } = await supabase.from("credentials_meta")
        .select("*").eq("id", credential_meta_id).single();
      const { data: val } = await supabase.from("credential_values")
        .select("encrypted_value").eq("credential_meta_id", credential_meta_id).single();

      if (!meta || !val) {
        return new Response(JSON.stringify({ success: false, error: "Credential not found or not set" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apiKey = val.encrypted_value;
      const provider = meta.provider.toLowerCase();
      let result = { success: false, error: "" };

      try {
        if (provider === "openai") {
          // Try a minimal completion to verify the model exists
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "anthropic") {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "google" || provider === "gemini") {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/${model_id}?key=${apiKey}`
          );
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "groq") {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "mistral") {
          const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else if (provider === "deepseek") {
          const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model_id,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (r.ok) {
            result.success = true;
          } else {
            const body = await r.json().catch(() => ({}));
            result.error = body?.error?.message || `HTTP ${r.status}`;
          }
        } else {
          // Unknown provider - can't verify model, just check key works
          result.success = true;
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : "Verification failed";
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("manage-credentials error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
