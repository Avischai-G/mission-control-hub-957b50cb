import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Provider routing config
const PROVIDER_ENDPOINTS: Record<string, { url: string; formatRequest: (model: string, messages: any[], systemPrompt: string) => { body: string; headers: Record<string, string> } }> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    }),
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages,
        max_tokens: 4096,
        stream: true,
      }),
    }),
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      }),
    }),
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      }),
    }),
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    }),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    }),
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    }),
  },
  together: {
    url: "https://api.together.xyz/v1/chat/completions",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    }),
  },
  fireworks: {
    url: "https://api.fireworks.ai/inference/v1/chat/completions",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    }),
  },
  perplexity: {
    url: "https://api.perplexity.ai/chat/completions",
    formatRequest: (model, messages, systemPrompt) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    }),
  },
};

function getAuthHeader(provider: string, apiKey: string): Record<string, string> {
  if (provider === "anthropic") return { "x-api-key": apiKey };
  if (provider === "google" || provider === "gemini") return {}; // key goes in URL
  return { Authorization: `Bearer ${apiKey}` };
}

function getProviderUrl(provider: string, model: string, apiKey: string): string {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) throw new Error(`Unsupported provider: ${provider}`);
  let url = config.url.replace("{model}", model);
  if (provider === "google" || provider === "gemini") url += `&key=${apiKey}`;
  return url;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, agent_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine which agent/model to use
    let modelId = "gpt-4o";
    let provider = "openai";
    let agentRecord: any = null;

    if (agent_id) {
      const { data: agent } = await supabase.from("agents").select("*").eq("agent_id", agent_id).single();
      agentRecord = agent;
      if (agent?.model) modelId = agent.model;
    }

    // Look up model in registry to get provider
    const { data: modelReg } = await supabase.from("model_registry")
      .select("*").eq("model_id", modelId).eq("is_active", true).single();

    if (modelReg) {
      provider = modelReg.provider.toLowerCase();
    }

    // Get API key for this provider from credential_values
    const { data: credMeta } = await supabase.from("credentials_meta")
      .select("id").eq("provider", provider).eq("is_set", true).limit(1).single();

    if (!credMeta) {
      return new Response(JSON.stringify({ error: `No API key configured for provider "${provider}". Add one in Setup → Credentials.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: credVal } = await supabase.from("credential_values")
      .select("encrypted_value").eq("credential_meta_id", credMeta.id).single();

    if (!credVal) {
      return new Response(JSON.stringify({ error: `API key for "${provider}" is not set. Configure it in Setup → Credentials.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = credVal.encrypted_value;

    // Get the latest user message
    const userMessage = messages[messages.length - 1];

    // Create a task record
    const { data: task } = await supabase.from("tasks").insert({
      title: userMessage.content.slice(0, 100),
      goal: userMessage.content,
      task_type: "chat",
      status: "received",
      assigned_agent_id: agent_id || "secretary",
    }).select().single();

    // Save user message
    await supabase.from("chat_messages").insert({
      role: "user",
      content: userMessage.content,
      task_id: task?.id,
    });

    // Log to live feed
    await supabase.from("live_feed_events").insert({
      event_type: "task_created",
      source: agent_id || "secretary",
      task_id: task?.id,
      payload: { title: userMessage.content.slice(0, 100), model: modelId, provider },
    });

    // Update task to classified
    if (task) {
      await supabase.from("tasks").update({ status: "classified" }).eq("id", task.id);
      await supabase.from("task_checklists").insert([
        { task_id: task.id, step: "received", status: "done", completed_at: new Date().toISOString() },
        { task_id: task.id, step: "classified", status: "done", completed_at: new Date().toISOString() },
        { task_id: task.id, step: "model_resolved", status: "done", completed_at: new Date().toISOString(), details: `${provider}/${modelId}` },
        { task_id: task.id, step: "specialist_running", status: "pending" },
        { task_id: task.id, step: "reported_to_secretary", status: "pending" },
      ]);
    }

    // Retrieve knowledge context
    const { data: knowledgeIndex } = await supabase
      .from("knowledge_files")
      .select("file_id, title, summary, domain")
      .eq("is_valid", true)
      .limit(20);

    const knowledgeContext = knowledgeIndex?.length
      ? `\nRelevant knowledge:\n${knowledgeIndex.map(k => `- [${k.file_id}] ${k.title}: ${k.summary || 'No summary'}`).join('\n')}`
      : "";

    // Build system prompt
    const agentInstructions = agentRecord?.instructions_md || "";
    const systemPrompt = agentRecord
      ? `You are ${agentRecord.name}.\nRole: ${agentRecord.role}\nPurpose: ${agentRecord.purpose}\n\n${agentInstructions}\n${knowledgeContext}`
      : `You are Secretary.\n\nRole:\nFast conversational assistant. You talk to the user, report task status, and return results.\n${knowledgeContext}`;

    // Update checklist
    if (task) {
      await supabase.from("task_checklists")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("task_id", task.id)
        .eq("step", "specialist_running");
      await supabase.from("tasks").update({ status: "specialist_running" }).eq("id", task.id);
    }

    // Route to correct provider
    const providerConfig = PROVIDER_ENDPOINTS[provider];
    if (!providerConfig) {
      throw new Error(`No endpoint config for provider: ${provider}`);
    }

    const { body: requestBody, headers: providerHeaders } = providerConfig.formatRequest(modelId, messages, systemPrompt);
    const url = getProviderUrl(provider, modelId, apiKey);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...providerHeaders,
        ...getAuthHeader(provider, apiKey),
      },
      body: requestBody,
    });

    if (!response.ok) {
      const t = await response.text();
      console.error(`Provider ${provider} error:`, response.status, t);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited by provider. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: `Authentication failed for ${provider}. Check your API key in Setup → Credentials.` }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Provider ${provider} error: ${response.status} - ${t.slice(0, 200)}`);
    }

    // For Anthropic, we need to transform the SSE stream to OpenAI format
    if (provider === "anthropic") {
      const reader = response.body!.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
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
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                  const openaiFormat = {
                    choices: [{ delta: { content: parsed.delta.text } }],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiFormat)}\n\n`));
                }
              } catch { /* skip */ }
            }
          }
        },
      });

      // Update task completion
      if (task) {
        await supabase.from("task_checklists")
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("task_id", task.id).eq("step", "reported_to_secretary");
        await supabase.from("tasks").update({ status: "reported_to_secretary" }).eq("id", task.id);
      }

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // For Google/Gemini, transform SSE stream to OpenAI format
    if (provider === "google" || provider === "gemini") {
      const reader = response.body!.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
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
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  const openaiFormat = {
                    choices: [{ delta: { content: text } }],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiFormat)}\n\n`));
                }
              } catch { /* skip */ }
            }
          }
        },
      });

      if (task) {
        await supabase.from("task_checklists")
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("task_id", task.id).eq("step", "reported_to_secretary");
        await supabase.from("tasks").update({ status: "reported_to_secretary" }).eq("id", task.id);
      }

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // OpenAI-compatible providers (openai, mistral, groq, deepseek, together, fireworks, perplexity)
    // Just pass through the SSE stream directly
    if (task) {
      await supabase.from("task_checklists")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("task_id", task.id).eq("step", "reported_to_secretary");
      await supabase.from("tasks").update({ status: "reported_to_secretary" }).eq("id", task.id);

      await supabase.from("live_feed_events").insert({
        event_type: "task_completed",
        source: agent_id || "secretary",
        task_id: task.id,
        payload: { status: "reported_to_secretary", model: modelId, provider },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
