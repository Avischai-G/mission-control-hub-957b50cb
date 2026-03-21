import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import {
  ensureAgentPromptFile,
  exportBranchFiles,
  getComputerRootLabel,
  ensureWorkspaceScaffold,
  getAgentPromptPath,
  getWorkspaceRoot,
  listBranchEntries,
  listRecentRunSummaries,
  pathExists,
  readBranchFile,
  readTextFileIfExists,
  writeTextFile,
} from "../_shared/claw-workspace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireUser(req);
    await ensureWorkspaceScaffold();

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "workspace_info") {
      return jsonResponse({ root: getWorkspaceRoot(), computer_root_label: getComputerRootLabel() });
    }

    if (action === "list_branch_entries") {
      const branch = typeof body.branch === "string" ? body.branch : "";
      const path = typeof body.path === "string" ? body.path : "";
      const entries = await listBranchEntries(
        branch as "computer" | "runs" | "learning" | "agents" | "knowledge" | "vault",
        path,
      );
      return jsonResponse({ entries });
    }

    if (action === "read_branch_file") {
      const branch = typeof body.branch === "string" ? body.branch : "";
      const path = typeof body.path === "string" ? body.path : "";
      const file = await readBranchFile(
        branch as "computer" | "runs" | "learning" | "agents" | "knowledge" | "vault",
        path,
      );
      return jsonResponse({ file });
    }

    if (action === "recent_summaries") {
      const limit = clampInt(body.limit, 1, 200, 50);
      const summaries = await listRecentRunSummaries(limit);
      return jsonResponse({ summaries });
    }

    if (action === "export_branch_files") {
      const branch = typeof body.branch === "string" ? body.branch : "";
      if (!["agents", "knowledge", "runs", "learning"].includes(branch)) {
        return jsonResponse({ error: "Unsupported branch export." }, 400);
      }

      const files = await exportBranchFiles(branch as "agents" | "knowledge" | "runs" | "learning");
      return jsonResponse({ files });
    }

    if (action === "sync_agent_prompts") {
      const { data: agents, error } = await supabase
        .from("agents")
        .select("agent_id, name, instructions_md")
        .order("name", { ascending: true });

      if (error) throw error;

      let synced = 0;
      for (const agent of (agents || []) as Array<{ agent_id: string; name: string | null; instructions_md: string | null }>) {
        await ensureAgentPromptFile(
          agent.agent_id,
          agent.instructions_md || `# ${agent.name || agent.agent_id}\n`,
        );
        synced += 1;
      }

      return jsonResponse({ success: true, synced });
    }

    if (action === "read_agent_prompt") {
      const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
      if (!agentId) return jsonResponse({ error: "agent_id is required." }, 400);

      const { data: agent, error } = await supabase
        .from("agents")
        .select("agent_id, instructions_md, model, name, role, purpose, is_active")
        .eq("agent_id", agentId)
        .single();

      if (error || !agent) {
        return jsonResponse({ error: "Agent not found." }, 404);
      }

      const promptPath = await ensureAgentPromptFile(agentId, agent.instructions_md || `# ${agent.name}\n`);
      const content = await readTextFileIfExists(promptPath, agent.instructions_md || "");

      const { data: policy } = await supabase
        .from("agent_policies")
        .select("allowed_tools")
        .eq("agent_id", agentId)
        .maybeSingle();

      const { data: model } = agent.model
        ? await supabase
            .from("model_registry")
            .select("model_id, display_name, provider, context_window_tokens, default_output_tokens")
            .eq("model_id", agent.model)
            .limit(1)
        : { data: [] as Array<Record<string, unknown>> };

      const selectedModel = Array.isArray(model) && model.length > 0 ? model[0] : null;
      const { data: recentTasks } = await supabase
        .from("tasks")
        .select("task_type, updated_at")
        .eq("assigned_agent_id", agentId)
        .order("updated_at", { ascending: false })
        .limit(clampInt(body.task_limit, 1, 8, 5));

      return jsonResponse({
        agent: {
          ...agent,
          allowed_tools: policy?.allowed_tools || [],
          prompt_path: promptPath,
          prompt_content: content,
          model_meta: selectedModel,
          recent_task_domains: Array.from(
            new Set(
              ((recentTasks || []) as Array<{ task_type: string | null }>).map((task) => task.task_type).filter(Boolean),
            ),
          ),
        },
      });
    }

    if (action === "write_agent_prompt") {
      const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
      const content = typeof body.content === "string" ? body.content : "";
      if (!agentId) return jsonResponse({ error: "agent_id is required." }, 400);

      const promptPath = getAgentPromptPath(agentId);
      await writeTextFile(promptPath, content);

      const { error } = await supabase
        .from("agents")
        .update({ instructions_md: content })
        .eq("agent_id", agentId);

      if (error) throw error;

      return jsonResponse({
        success: true,
        prompt_path: promptPath,
        exists: await pathExists(promptPath),
      });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("workspace-files error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Authentication required." ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
