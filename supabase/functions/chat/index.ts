import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the latest user message
    const userMessage = messages[messages.length - 1];

    // Create a task record
    const { data: task } = await supabase.from("tasks").insert({
      title: userMessage.content.slice(0, 100),
      goal: userMessage.content,
      task_type: "chat",
      status: "received",
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
      source: "secretary",
      task_id: task?.id,
      payload: { title: userMessage.content.slice(0, 100) },
    });

    // Update task to classified
    if (task) {
      await supabase.from("tasks").update({ status: "classified" }).eq("id", task.id);
      await supabase.from("task_checklists").insert([
        { task_id: task.id, step: "received", status: "done", completed_at: new Date().toISOString() },
        { task_id: task.id, step: "classified", status: "done", completed_at: new Date().toISOString() },
        { task_id: task.id, step: "recent_context_ready", status: "pending" },
        { task_id: task.id, step: "long_term_context_ready", status: "pending" },
        { task_id: task.id, step: "agent_selected", status: "pending" },
        { task_id: task.id, step: "specialist_running", status: "pending" },
        { task_id: task.id, step: "reported_to_secretary", status: "pending" },
      ]);
    }

    // Retrieve recent context from knowledge files
    const { data: knowledgeIndex } = await supabase
      .from("knowledge_files")
      .select("file_id, title, summary, domain")
      .eq("is_valid", true)
      .limit(20);

    // Build context from knowledge
    const knowledgeContext = knowledgeIndex?.length
      ? `\nRelevant knowledge:\n${knowledgeIndex.map(k => `- [${k.file_id}] ${k.title}: ${k.summary || 'No summary'}`).join('\n')}`
      : "";

    // Update checklist
    if (task) {
      await supabase.from("task_checklists")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("task_id", task.id)
        .in("step", ["recent_context_ready", "long_term_context_ready", "agent_selected", "specialist_running"]);
      await supabase.from("tasks").update({ status: "specialist_running" }).eq("id", task.id);
    }

    // Call AI via Lovable AI Gateway
    const systemPrompt = `You are Secretary.

Role:
Fast conversational assistant. You talk to the user, report task status, and return results. You never execute tasks yourself.

You are not responsible for:
- Executing tasks or tool calls
- Accessing secrets or credentials
- Modifying files or databases directly

Input:
You receive user messages in a chat context.${knowledgeContext}

Output:
Natural conversational responses. Be concise, helpful, and honest about what you know and don't know.

Method:
1. Understand the user's request.
2. Provide the best answer from available context.
3. If you cannot answer, say so clearly.

Self-check:
- Response is relevant to the question.
- No fabricated facts.
- No claims about capabilities you don't have.

Failure statuses:
- insufficient_context
- cannot_execute
- failed_check`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // Update task status
    if (task) {
      await supabase.from("task_checklists")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("task_id", task.id)
        .eq("step", "reported_to_secretary");
      await supabase.from("tasks").update({ status: "reported_to_secretary" }).eq("id", task.id);

      await supabase.from("live_feed_events").insert({
        event_type: "task_completed",
        source: "secretary",
        task_id: task.id,
        payload: { status: "reported_to_secretary" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
