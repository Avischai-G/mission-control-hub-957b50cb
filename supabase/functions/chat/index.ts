import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Provider routing ──
const PROVIDER_ENDPOINTS: Record<string, {
  url: string;
  formatRequest: (model: string, messages: any[], opts?: any) => { body: string; headers: Record<string, string> };
}> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false }),
    }),
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    formatRequest: (model, messages, opts) => {
      const sys = messages.find((m: any) => m.role === "system")?.content || "";
      const nonSys = messages.filter((m: any) => m.role !== "system");
      return {
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, system: sys, messages: nonSys, max_tokens: 4096, stream: opts?.stream ?? false }),
      };
    },
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    formatRequest: (model, messages) => {
      const sys = messages.find((m: any) => m.role === "system")?.content || "";
      const nonSys = messages.filter((m: any) => m.role !== "system");
      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: nonSys.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        }),
      };
    },
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    formatRequest: (model, messages) => {
      const sys = messages.find((m: any) => m.role === "system")?.content || "";
      const nonSys = messages.filter((m: any) => m.role !== "system");
      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: nonSys.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        }),
      };
    },
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false }),
    }),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false }),
    }),
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false }),
    }),
  },
  together: {
    url: "https://api.together.xyz/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false }),
    }),
  },
  fireworks: {
    url: "https://api.fireworks.ai/inference/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false }),
    }),
  },
  perplexity: {
    url: "https://api.perplexity.ai/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false }),
    }),
  },
};

function getAuthHeader(provider: string, apiKey: string): Record<string, string> {
  if (provider === "anthropic") return { "x-api-key": apiKey };
  if (provider === "google" || provider === "gemini") return {};
  return { Authorization: `Bearer ${apiKey}` };
}

function getProviderUrl(provider: string, model: string, apiKey: string, stream = false): string {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) throw new Error(`Unsupported provider: ${provider}`);
  let url = config.url.replace("{model}", model);
  if (provider === "google" || provider === "gemini") {
    if (stream) url = url.replace("generateContent", "streamGenerateContent") + "?alt=sse&key=" + apiKey;
    else url += "?key=" + apiKey;
  }
  return url;
}

async function callLLM(provider: string, model: string, apiKey: string, messages: any[]): Promise<string> {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) throw new Error(`No config for provider: ${provider}`);
  const { body, headers } = config.formatRequest(model, messages, { stream: false });
  const url = getProviderUrl(provider, model, apiKey, false);
  const resp = await fetch(url, { method: "POST", headers: { ...headers, ...getAuthHeader(provider, apiKey) }, body });
  if (!resp.ok) { const t = await resp.text(); throw new Error(`LLM error ${resp.status}: ${t.slice(0, 300)}`); }
  const data = await resp.json();
  if (provider === "google" || provider === "gemini") return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (provider === "anthropic") return data.content?.[0]?.text || "";
  return data.choices?.[0]?.message?.content || "";
}

function streamLLM(provider: string, model: string, apiKey: string, messages: any[]): Promise<Response> {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) throw new Error(`No config for provider: ${provider}`);
  let body: string, headers: Record<string, string>;
  if (provider === "google" || provider === "gemini") {
    const sys = messages.find((m: any) => m.role === "system")?.content || "";
    const nonSys = messages.filter((m: any) => m.role !== "system");
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: nonSys.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) });
  } else if (provider === "anthropic") {
    const sys = messages.find((m: any) => m.role === "system")?.content || "";
    const nonSys = messages.filter((m: any) => m.role !== "system");
    headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
    body = JSON.stringify({ model, system: sys, messages: nonSys, max_tokens: 4096, stream: true });
  } else {
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify({ model, messages, stream: true });
  }
  const url = getProviderUrl(provider, model, apiKey, true);
  return fetch(url, { method: "POST", headers: { ...headers, ...getAuthHeader(provider, apiKey) }, body });
}

async function resolveAgent(supabase: any, agentId: string) {
  const { data: agent } = await supabase.from("agents").select("*").eq("agent_id", agentId).single();
  if (!agent) throw new Error(`Agent "${agentId}" not found`);
  if (!agent.model) throw new Error(`Agent "${agentId}" has no model configured`);
  const modelId = agent.model;
  const { data: modelReg } = await supabase.from("model_registry").select("*").eq("model_id", modelId).eq("is_active", true).single();
  const provider = modelReg ? modelReg.provider.toLowerCase() : "openai";
  const { data: credMeta } = await supabase.from("credentials_meta").select("id").eq("provider", provider).eq("is_set", true).limit(1).single();
  if (!credMeta) throw new Error(`No API key for provider "${provider}". Add one in Setup → Credentials.`);
  const { data: credVal } = await supabase.from("credential_values").select("encrypted_value").eq("credential_meta_id", credMeta.id).single();
  if (!credVal) throw new Error(`API key for "${provider}" not set.`);
  return { agent, modelId, provider, apiKey: credVal.encrypted_value };
}

async function uploadToStorage(supabase: any, filename: string, html: string, supabaseUrl: string): Promise<string> {
  const data = new TextEncoder().encode(html);
  const { error } = await supabase.storage.from("generated-files").upload(filename, data, { contentType: "text/html", upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return `${supabaseUrl}/storage/v1/object/public/generated-files/${filename}`;
}

function metaEvent(data: Record<string, any>): string {
  return `data: ${JSON.stringify({ type: "meta", ...data })}\n\n`;
}

function textChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const userMessage = messages[messages.length - 1]?.content || "";
    await supabase.from("chat_messages").insert({ role: "user", content: userMessage, agent_id: "secretary" });

    // ── Classify intent ──
    let orchestratorInfo;
    try { orchestratorInfo = await resolveAgent(supabase, "orchestrator"); }
    catch { try { orchestratorInfo = await resolveAgent(supabase, "secretary"); } catch (e2: any) {
      return new Response(JSON.stringify({ error: e2.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }}

    const orchestratorPrompt = orchestratorInfo.agent?.instructions_md || "Classify this request. Respond ONLY with JSON: {\"category\": \"presentation\"|\"website\"|\"cron\"|\"chat\"}";
    const classificationResult = await callLLM(
      orchestratorInfo.provider, orchestratorInfo.modelId, orchestratorInfo.apiKey,
      [{ role: "system", content: orchestratorPrompt + '\n\nAdditional category: "cron" — use when the user wants to schedule, repeat, or automate something on a timer (e.g. "every morning", "every hour", "remind me daily", "run X every 30 minutes"). Extract schedule and prompt. Respond with JSON: {"category":"cron","schedule":"<cron expression>","prompt":"<what to do>","name":"<short name>"}. Schedule presets: every 5 min = "*/5 * * * *", every 30 min = "*/30 * * * *", every hour = "0 * * * *", every 8h = "0 */8 * * *", daily 9am = "0 9 * * *", weekly mon = "0 9 * * 1".' },
       { role: "user", content: userMessage }]
    );

    let category = "chat";
    let cronData: { schedule?: string; prompt?: string; name?: string } = {};
    try {
      const parsed = JSON.parse(classificationResult.trim());
      category = parsed.category || "chat";
      if (category === "cron") {
        cronData = { schedule: parsed.schedule, prompt: parsed.prompt, name: parsed.name };
      }
    } catch {
      if (classificationResult.toLowerCase().includes("presentation")) category = "presentation";
      else if (classificationResult.toLowerCase().includes("website")) category = "website";
      else if (classificationResult.toLowerCase().includes("cron")) category = "cron";
    }

    // ── Handle cron job creation ──
    if (category === "cron" && cronData.schedule && cronData.prompt) {
      await supabase.from("cron_jobs").insert({
        name: cronData.name || userMessage.slice(0, 50),
        schedule: cronData.schedule,
        function_name: "cron-execute",
        is_active: true,
        config: { prompt: cronData.prompt },
      });
    }

    // ── Create task record for specialist work ──
    const specialistId = category === "presentation" ? "presentation-agent" : category === "website" ? "website-agent" : "secretary";
    let taskRecord: any = null;
    if (category !== "chat" && category !== "cron") {
      const { data: task } = await supabase.from("tasks").insert({
        title: userMessage.slice(0, 100), goal: userMessage, task_type: category,
        status: "received", assigned_agent_id: specialistId,
      }).select().single();
      taskRecord = task;
    }

    // ── Resolve secretary for streaming chat ──
    let secretaryInfo;
    try { secretaryInfo = await resolveAgent(supabase, "secretary"); }
    catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const { data: knowledgeIndex } = await supabase.from("knowledge_files")
      .select("file_id, title, summary, domain").eq("is_valid", true).limit(20);
    const knowledgeContext = knowledgeIndex?.length
      ? `\nKnowledge context:\n${knowledgeIndex.map((k: any) => `- ${k.title}: ${k.summary || 'No summary'}`).join('\n')}`
      : "";

    const secretarySystem = (secretaryInfo.agent?.instructions_md || "You are Secretary, a helpful assistant.") + knowledgeContext;

    // For specialist tasks, tell secretary to acknowledge and delegate
    let secretaryMessages: any[];
    if (category === "cron") {
      const cronHint = `\n\nIMPORTANT: The user just scheduled a cron job. Confirm what was scheduled: name="${cronData.name}", schedule="${cronData.schedule}", prompt="${cronData.prompt}". Tell them they can manage it on the Cron Jobs page. Be brief and conversational.`;
      secretaryMessages = [
        { role: "system", content: secretarySystem + cronHint },
        ...messages,
      ];
    } else if (category !== "chat") {
      const delegationHint = `\n\nIMPORTANT: The user just asked for a ${category}. Tell them you are delegating this to the ${category} specialist and they can keep chatting. Be brief and conversational. Do NOT try to create the ${category} yourself.`;
      secretaryMessages = [
        { role: "system", content: secretarySystem + delegationHint },
        ...messages,
      ];
    } else {
      secretaryMessages = [
        { role: "system", content: secretarySystem },
        ...messages,
      ];
    }

    // ── Build SSE stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Phase 1: Stream secretary's response
          const secretaryResp = await streamLLM(
            secretaryInfo.provider, secretaryInfo.modelId, secretaryInfo.apiKey, secretaryMessages
          );

          if (!secretaryResp.ok) {
            const errText = await secretaryResp.text();
            throw new Error(`Secretary error ${secretaryResp.status}: ${errText.slice(0, 200)}`);
          }

          // Pipe secretary stream
          const provider = secretaryInfo.provider;
          const reader = secretaryResp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let secretaryContent = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") { if (jsonStr === "[DONE]") break; continue; }
              try {
                const parsed = JSON.parse(jsonStr);
                let text = "";
                if (provider === "anthropic" && parsed.type === "content_block_delta") text = parsed.delta?.text || "";
                else if (provider === "google" || provider === "gemini") text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                else text = parsed.choices?.[0]?.delta?.content || "";
                if (text) {
                  secretaryContent += text;
                  controller.enqueue(encoder.encode(textChunk(text)));
                }
              } catch { /* skip */ }
            }
          }

          // Save secretary response
          if (secretaryContent) {
            await supabase.from("chat_messages").insert({
              role: "assistant", content: secretaryContent, agent_id: "secretary",
              task_id: taskRecord?.id || null,
            });
          }

          // Phase 2: If specialist task, run it and emit meta events to timeline
          if (category !== "chat" && taskRecord) {
            let specialistInfo;
            try { specialistInfo = await resolveAgent(supabase, specialistId); }
            catch { specialistInfo = { agent: null, modelId: orchestratorInfo.modelId, provider: orchestratorInfo.provider, apiKey: orchestratorInfo.apiKey }; }

            // Emit: task started
            controller.enqueue(encoder.encode(metaEvent({
              taskId: taskRecord.id, category, status: "classifying",
              agentName: specialistId,
              actions: [
                { agent: "orchestrator", title: "Classifying request", status: "done" },
                { agent: specialistId, title: `Generating ${category}`, status: "running" },
              ],
            })));

            await supabase.from("tasks").update({ status: "specialist_running" }).eq("id", taskRecord.id);

            try {
              let systemPrompt = specialistInfo.agent?.instructions_md || `Generate a beautiful self-contained HTML ${category}. Output ONLY raw HTML starting with <!DOCTYPE html>.`;

              // Load knowledge for website
              if (category === "website") {
                const { data: knowledge } = await supabase.from("knowledge_files")
                  .select("title, content, summary").eq("is_valid", true).eq("domain", "personal").limit(10);
                if (knowledge?.length) {
                  systemPrompt += "\n\nKnowledge about the person:\n" + knowledge.map((k: any) => `### ${k.title}\n${k.content}`).join("\n\n");
                  controller.enqueue(encoder.encode(metaEvent({
                    taskId: taskRecord.id, status: "context_loaded",
                    actions: [
                      { agent: "orchestrator", title: "Classifying request", status: "done" },
                      { agent: "context-agent", title: "Loading knowledge", status: "done", output: `${knowledge.length} file(s)` },
                      { agent: specialistId, title: `Generating ${category}`, status: "running" },
                    ],
                  })));
                }
              }

              const htmlContent = await callLLM(
                specialistInfo.provider, specialistInfo.modelId, specialistInfo.apiKey,
                [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }]
              );

              let cleanHtml = htmlContent.trim();
              if (cleanHtml.startsWith("```html")) cleanHtml = cleanHtml.slice(7);
              else if (cleanHtml.startsWith("```")) cleanHtml = cleanHtml.slice(3);
              if (cleanHtml.endsWith("```")) cleanHtml = cleanHtml.slice(0, -3);
              cleanHtml = cleanHtml.trim();

              const timestamp = Date.now();
              const filename = category === "presentation"
                ? `presentations/presentation-${timestamp}.html`
                : `websites/website-${timestamp}.html`;
              const publicUrl = await uploadToStorage(supabase, filename, cleanHtml, supabaseUrl);

              await supabase.from("tasks").update({
                status: "reported_to_secretary", result: { url: publicUrl, type: category }
              }).eq("id", taskRecord.id);

              // Emit: task done
              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id, status: "done", url: publicUrl,
                actions: [
                  { agent: "orchestrator", title: "Classifying request", status: "done" },
                  ...(category === "website" ? [{ agent: "context-agent", title: "Loading knowledge", status: "done" }] : []),
                  { agent: specialistId, title: `Generating ${category}`, status: "done" },
                  { agent: "storage", title: "Uploading file", status: "done", output: publicUrl },
                ],
              })));

              // Send result message in chat
              const resultText = category === "presentation"
                ? `\n\n✅ **Presentation ready!** 🔗 [Open Presentation](${publicUrl})`
                : `\n\n✅ **Website ready!** 🔗 [Open Website](${publicUrl})`;
              controller.enqueue(encoder.encode(textChunk(resultText)));

              await supabase.from("chat_messages").insert({
                role: "assistant", content: resultText.trim(), agent_id: specialistId, task_id: taskRecord.id,
              });

            } catch (err: any) {
              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id, status: "failed", error: err.message,
                actions: [
                  { agent: "orchestrator", title: "Classifying request", status: "done" },
                  { agent: specialistId, title: `Generating ${category}`, status: "failed" },
                ],
              })));
              controller.enqueue(encoder.encode(textChunk(`\n\n❌ **Task failed:** ${err.message}`)));
              await supabase.from("tasks").update({ status: "failed" }).eq("id", taskRecord.id);
            }
          }

        } catch (err: any) {
          controller.enqueue(encoder.encode(textChunk(`❌ Error: ${err.message}`)));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });

  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
