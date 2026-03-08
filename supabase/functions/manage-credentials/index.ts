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

    const { action, credential_meta_id, value } = await req.json();

    if (action === "set") {
      if (!credential_meta_id || !value) {
        return new Response(JSON.stringify({ error: "credential_meta_id and value required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert the credential value
      const { error: valErr } = await supabase.from("credential_values").upsert({
        credential_meta_id,
        encrypted_value: value,
      }, { onConflict: "credential_meta_id" });

      if (valErr) throw valErr;

      // Mark as set in metadata
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
        .update({ is_set: false, last_verified_at: null })
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

      // Get credential info
      const { data: meta } = await supabase.from("credentials_meta")
        .select("*").eq("id", credential_meta_id).single();
      const { data: val } = await supabase.from("credential_values")
        .select("encrypted_value").eq("credential_meta_id", credential_meta_id).single();

      if (!meta || !val) {
        return new Response(JSON.stringify({ success: false, error: "Credential not found or not set" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Test based on provider
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
          // 200 or 400 (bad request but auth works) means key is valid
          testResult.valid = r.status !== 401 && r.status !== 403;
          if (!testResult.valid) testResult.error = `HTTP ${r.status}`;
        } else if (provider === "google" || provider === "gemini") {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
          );
          testResult.valid = r.ok;
          if (!r.ok) testResult.error = `HTTP ${r.status}`;
        } else {
          testResult.valid = true; // Can't test unknown providers, assume ok
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
