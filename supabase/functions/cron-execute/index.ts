import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_id, run_id } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch job config
    const { data: job, error: jobErr } = await supabase
      .from("cron_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      throw new Error(`Job not found: ${job_id}`);
    }

    const prompt = job.config?.prompt || "Hello, run your scheduled task.";

    // Resolve secretary agent for execution
    const { data: agent } = await supabase
      .from("agents")
      .select("*")
      .eq("agent_id", "secretary")
      .single();

    if (!agent?.model) throw new Error("Secretary agent has no model configured.");

    const { data: modelReg } = await supabase
      .from("model_registry")
      .select("*")
      .eq("model_id", agent.model)
      .eq("is_active", true)
      .single();

    const provider = modelReg?.provider?.toLowerCase() || "google";

    const { data: credMeta } = await supabase
      .from("credentials_meta")
      .select("id")
      .eq("provider", provider)
      .eq("is_set", true)
      .limit(1)
      .single();

    if (!credMeta) throw new Error(`No API key for provider "${provider}".`);

    const { data: credVal } = await supabase
      .from("credential_values")
      .select("encrypted_value")
      .eq("credential_meta_id", credMeta.id)
      .single();

    if (!credVal) throw new Error(`API key not set for "${provider}".`);

    const apiKey = credVal.encrypted_value;

    // Call the LLM
    const systemPrompt = agent.instructions_md || "You are a helpful assistant executing a scheduled task.";
    const messages = [
      { role: "system", content: systemPrompt + "\n\nThis is a scheduled cron job execution. Complete the task and provide a concise result." },
      { role: "user", content: prompt },
    ];

    let responseText = "";

    if (provider === "google" || provider === "gemini") {
      const modelId = agent.model;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const nonSys = messages.filter(m => m.role !== "system");
      const sys = messages.find(m => m.role === "system")?.content || "";

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: nonSys.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`LLM error ${resp.status}: ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      // OpenAI-compatible
      const urls: Record<string, string> = {
        openai: "https://api.openai.com/v1/chat/completions",
        anthropic: "https://api.anthropic.com/v1/messages",
        groq: "https://api.groq.com/openai/v1/chat/completions",
        deepseek: "https://api.deepseek.com/v1/chat/completions",
        together: "https://api.together.xyz/v1/chat/completions",
        fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
        mistral: "https://api.mistral.ai/v1/chat/completions",
        perplexity: "https://api.perplexity.ai/chat/completions",
      };

      const url = urls[provider] || urls.openai;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (provider === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      let body: string;
      if (provider === "anthropic") {
        const sys = messages.find(m => m.role === "system")?.content || "";
        const nonSys = messages.filter(m => m.role !== "system");
        body = JSON.stringify({ model: agent.model, system: sys, messages: nonSys, max_tokens: 4096 });
      } else {
        body = JSON.stringify({ model: agent.model, messages });
      }

      const resp = await fetch(url, { method: "POST", headers, body });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`LLM error ${resp.status}: ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      if (provider === "anthropic") {
        responseText = data.content?.[0]?.text || "";
      } else {
        responseText = data.choices?.[0]?.message?.content || "";
      }
    }

    // Update run record
    if (run_id) {
      await supabase.from("cron_job_runs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result: { response: responseText.slice(0, 5000) },
      }).eq("id", run_id);
    }

    // Save to chat history
    await supabase.from("chat_messages").insert([
      { role: "user", content: `[Cron: ${job.name}] ${prompt}`, agent_id: "cron-scheduler" },
      { role: "assistant", content: responseText, agent_id: "secretary" },
    ]);

    // Update job last_run_at
    await supabase.from("cron_jobs").update({ last_run_at: new Date().toISOString() }).eq("id", job_id);

    return new Response(JSON.stringify({ success: true, response: responseText.slice(0, 500) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cron-execute error:", e);

    // Try to update the run as failed
    try {
      const { run_id } = await new Response(req.body).json().catch(() => ({}));
      if (run_id) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase.from("cron_job_runs").update({
          status: "failed", completed_at: new Date().toISOString(),
          error: e instanceof Error ? e.message : "Unknown error",
        }).eq("id", run_id);
      }
    } catch { /* best effort */ }

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
