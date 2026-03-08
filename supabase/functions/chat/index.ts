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
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, ...(opts?.tools ? { tools: opts.tools, tool_choice: opts.tool_choice } : {}) }),
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
          contents: nonSys.map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
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
          contents: nonSys.map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
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

async function callLLM(
  provider: string, model: string, apiKey: string, messages: any[], opts?: any
): Promise<string> {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) throw new Error(`No config for provider: ${provider}`);
  const { body, headers } = config.formatRequest(model, messages, { stream: false, ...opts });
  const url = getProviderUrl(provider, model, apiKey, false);

  const resp = await fetch(url, {
    method: "POST",
    headers: { ...headers, ...getAuthHeader(provider, apiKey) },
    body,
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM ${provider}/${model} error ${resp.status}: ${t.slice(0, 300)}`);
  }

  const data = await resp.json();
  if (provider === "google" || provider === "gemini") {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  if (provider === "anthropic") {
    return data.content?.[0]?.text || "";
  }
  return data.choices?.[0]?.message?.content || "";
}

function streamLLM(
  provider: string, model: string, apiKey: string, messages: any[]
): Promise<Response> {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) throw new Error(`No config for provider: ${provider}`);
  
  let body: string;
  let headers: Record<string, string>;
  
  if (provider === "google" || provider === "gemini") {
    const sys = messages.find((m: any) => m.role === "system")?.content || "";
    const nonSys = messages.filter((m: any) => m.role !== "system");
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents: nonSys.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    });
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
  return fetch(url, {
    method: "POST",
    headers: { ...headers, ...getAuthHeader(provider, apiKey) },
    body,
  });
}

async function resolveAgent(supabase: any, agentId: string) {
  const { data: agent } = await supabase.from("agents").select("*").eq("agent_id", agentId).single();
  if (!agent) throw new Error(`Agent "${agentId}" not found`);
  if (!agent.model) throw new Error(`Agent "${agentId}" has no model configured`);

  const modelId = agent.model;
  const { data: modelReg } = await supabase.from("model_registry")
    .select("*").eq("model_id", modelId).eq("is_active", true).single();
  
  const provider = modelReg ? modelReg.provider.toLowerCase() : "openai";

  const { data: credMeta } = await supabase.from("credentials_meta")
    .select("id").eq("provider", provider).eq("is_set", true).limit(1).single();
  if (!credMeta) throw new Error(`No API key for provider "${provider}". Add one in Setup → Credentials.`);

  const { data: credVal } = await supabase.from("credential_values")
    .select("encrypted_value").eq("credential_meta_id", credMeta.id).single();
  if (!credVal) throw new Error(`API key for "${provider}" not set.`);

  return { agent, modelId, provider, apiKey: credVal.encrypted_value };
}

async function uploadToStorage(supabase: any, filename: string, html: string, supabaseUrl: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(html);
  
  const { error } = await supabase.storage
    .from("generated-files")
    .upload(filename, data, { contentType: "text/html", upsert: true });
  
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  
  return `${supabaseUrl}/storage/v1/object/public/generated-files/${filename}`;
}

// Helper to create SSE meta event
function metaEvent(data: Record<string, any>): string {
  return `data: ${JSON.stringify({ type: "meta", ...data })}\n\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const userMessage = messages[messages.length - 1]?.content || "";

    // Save user message
    await supabase.from("chat_messages").insert({ role: "user", content: userMessage, agent_id: "secretary" });

    // ── Step 1: Orchestrator classifies ──
    let orchestratorInfo;
    try {
      orchestratorInfo = await resolveAgent(supabase, "orchestrator");
    } catch {
      try {
        orchestratorInfo = await resolveAgent(supabase, "secretary");
      } catch (e2: any) {
        return new Response(JSON.stringify({ error: e2.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const classificationPrompt = `You are the Main Orchestrator. Classify this user request into one of these categories:
- "presentation" — if the user wants a presentation/slides created
- "website" — if the user wants a website or web page created about someone/something
- "chat" — for all other general questions or conversation

Respond with ONLY a JSON object: {"category": "...", "details": "brief description of what to create"}

User request: "${userMessage}"`;

    const classificationResult = await callLLM(
      orchestratorInfo.provider, orchestratorInfo.modelId, orchestratorInfo.apiKey,
      [{ role: "system", content: "You are a task classifier. Respond with ONLY valid JSON." }, { role: "user", content: classificationPrompt }]
    );

    let category = "chat";
    let details = userMessage;
    try {
      const parsed = JSON.parse(classificationResult.trim());
      category = parsed.category || "chat";
      details = parsed.details || userMessage;
    } catch {
      const lower = classificationResult.toLowerCase();
      if (lower.includes("presentation")) category = "presentation";
      else if (lower.includes("website")) category = "website";
    }

    // Create task record
    const specialistId = category === "presentation" ? "presentation-agent" : category === "website" ? "website-agent" : "secretary";
    const { data: task } = await supabase.from("tasks").insert({
      title: userMessage.slice(0, 100),
      goal: userMessage,
      task_type: category,
      status: "received",
      assigned_agent_id: specialistId,
    }).select().single();

    await supabase.from("live_feed_events").insert({
      event_type: "task_created",
      source: "orchestrator",
      task_id: task?.id,
      payload: { title: userMessage.slice(0, 100), category, details },
    });

    // ── Specialist tasks ──
    if (category === "presentation" || category === "website") {
      let specialistInfo;
      try {
        specialistInfo = await resolveAgent(supabase, specialistId);
      } catch {
        const { data: specAgent } = await supabase.from("agents").select("*").eq("agent_id", specialistId).single();
        specialistInfo = {
          agent: specAgent,
          modelId: orchestratorInfo.modelId,
          provider: orchestratorInfo.provider,
          apiKey: orchestratorInfo.apiKey,
        };
      }

      if (task) {
        await supabase.from("tasks").update({ status: "specialist_running" }).eq("id", task.id);
      }

      // Build a streaming response with meta events
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          // Send initial meta
          controller.enqueue(encoder.encode(metaEvent({
            agent: specialistId,
            agentName: specialistInfo.agent?.name || specialistId,
            model: specialistInfo.modelId,
            taskId: task?.id,
            category,
            status: "classifying",
            actions: [
              { agent: "orchestrator", title: "Classifying request", status: "done" },
            ],
          })));

          // Send "specialist running" meta
          controller.enqueue(encoder.encode(metaEvent({
            status: "specialist_running",
            actions: [
              { agent: "orchestrator", title: "Classifying request", status: "done" },
              { agent: specialistId, title: `Generating ${category}`, status: "running" },
            ],
          })));

          try {
            let systemPrompt = specialistInfo.agent?.instructions_md || "";
            
            if (category === "website") {
              const { data: knowledge } = await supabase
                .from("knowledge_files")
                .select("title, content, summary")
                .eq("is_valid", true)
                .eq("domain", "personal")
                .limit(10);
              
              if (knowledge?.length) {
                systemPrompt += "\n\nHere is the knowledge context about the person:\n" +
                  knowledge.map((k: any) => `### ${k.title}\n${k.content}`).join("\n\n");

                controller.enqueue(encoder.encode(metaEvent({
                  status: "context_loaded",
                  actions: [
                    { agent: "orchestrator", title: "Classifying request", status: "done" },
                    { agent: "context-agent", title: "Loading knowledge context", status: "done", output: `Found ${knowledge.length} knowledge file(s)` },
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

            if (task) {
              await supabase.from("tasks").update({ 
                status: "reported_to_secretary",
                result: { url: publicUrl, type: category }
              }).eq("id", task.id);
            }

            await supabase.from("live_feed_events").insert({
              event_type: "task_completed",
              source: specialistId,
              task_id: task?.id,
              payload: { url: publicUrl, type: category },
            });

            // Send completion meta
            controller.enqueue(encoder.encode(metaEvent({
              status: "done",
              url: publicUrl,
              actions: [
                { agent: "orchestrator", title: "Classifying request", status: "done" },
                ...(category === "website" ? [{ agent: "context-agent", title: "Loading knowledge context", status: "done" }] : []),
                { agent: specialistId, title: `Generating ${category}`, status: "done" },
                { agent: "storage", title: "Uploading file", status: "done", output: publicUrl },
              ],
            })));

            const responseText = category === "presentation"
              ? `✅ **Presentation created!**\n\nI've generated a presentation about the requested topic.\n\n🔗 **[Open Presentation](${publicUrl})**`
              : `✅ **Website created!**\n\nI've built a personal website using your knowledge profile.\n\n🔗 **[Open Website](${publicUrl})**`;

            await supabase.from("chat_messages").insert({
              role: "assistant", content: responseText, agent_id: specialistId, task_id: task?.id,
            });

            const chunk = { choices: [{ delta: { content: responseText } }] };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          } catch (err: any) {
            // Send failure meta
            controller.enqueue(encoder.encode(metaEvent({
              status: "failed",
              error: err.message,
              actions: [
                { agent: "orchestrator", title: "Classifying request", status: "done" },
                { agent: specialistId, title: `Generating ${category}`, status: "failed" },
              ],
            })));
            
            const errorChunk = { choices: [{ delta: { content: `❌ **Task failed:** ${err.message}` } }] };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ── Regular chat: stream through secretary ──
    let secretaryInfo;
    try {
      secretaryInfo = await resolveAgent(supabase, "secretary");
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: knowledgeIndex } = await supabase
      .from("knowledge_files")
      .select("file_id, title, summary, domain")
      .eq("is_valid", true)
      .limit(20);

    const knowledgeContext = knowledgeIndex?.length
      ? `\nRelevant knowledge:\n${knowledgeIndex.map((k: any) => `- [${k.file_id}] ${k.title}: ${k.summary || 'No summary'}`).join('\n')}`
      : "";

    const systemPrompt = secretaryInfo.agent?.instructions_md 
      || `You are Secretary. A fast conversational assistant.`;

    const fullSystemPrompt = systemPrompt + knowledgeContext;

    const streamMessages = [
      { role: "system", content: fullSystemPrompt },
      ...messages,
    ];

    const response = await streamLLM(
      secretaryInfo.provider, secretaryInfo.modelId, secretaryInfo.apiKey, streamMessages
    );

    if (!response.ok) {
      const t = await response.text();
      console.error(`Secretary stream error:`, response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: `Auth failed for ${secretaryInfo.provider}. Check API key.` }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Provider error: ${response.status} - ${t.slice(0, 200)}`);
    }

    // For chat, prepend a meta event with agent info, then pipe the stream
    const provider = secretaryInfo.provider;
    const reader = response.body!.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const chatStream = new ReadableStream({
      async start(controller) {
        // Send meta event first
        controller.enqueue(encoder.encode(metaEvent({
          agent: "secretary",
          agentName: secretaryInfo.agent?.name || "Secretary",
          model: secretaryInfo.modelId,
          taskId: task?.id,
          category: "chat",
          status: "streaming",
        })));

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") {
              if (jsonStr === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
              continue;
            }
            try {
              const parsed = JSON.parse(jsonStr);
              let text = "";
              if (provider === "anthropic" && parsed.type === "content_block_delta") {
                text = parsed.delta?.text || "";
              } else if (provider === "google" || provider === "gemini") {
                text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
              } else {
                // OpenAI-compatible
                text = parsed.choices?.[0]?.delta?.content || "";
              }
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
              }
            } catch { /* skip */ }
          }
        }
      },
    });

    return new Response(chatStream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
