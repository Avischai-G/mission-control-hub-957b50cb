import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallerContext } from "../_shared/auth.ts";
import { decryptSecretIfNeeded } from "../_shared/credential-security.ts";
import { writeRunSummaryFile } from "../_shared/claw-workspace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function getOpenRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "X-Title": Deno.env.get("OPENROUTER_APP_NAME") || "AI Mission Control",
  };
  const referer = Deno.env.get("OPENROUTER_SITE_URL") || Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL");
  if (referer) headers["HTTP-Referer"] = referer;
  return headers;
}

function pickOwnedRow<T extends { owner_user_id?: string | null }>(
  rows: T[] | null | undefined,
  ownerUserId?: string | null,
): T | null {
  if (!rows?.length) return null;
  if (ownerUserId) {
    const owned = rows.find((row) => row.owner_user_id === ownerUserId);
    if (owned) return owned;
  }
  return rows.find((row) => row.owner_user_id == null) || rows[0];
}

function getLinkedCredentialId(modelReg: { config?: Record<string, unknown> | null } | null | undefined): string | null {
  const config = modelReg?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const credentialId = (config as Record<string, unknown>).credential_id;
  return typeof credentialId === "string" && credentialId.length > 0 ? credentialId : null;
}

function getConfiguredModelId(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const modelId = (config as Record<string, unknown>).model_id;
  return typeof modelId === "string" && modelId.length > 0 ? modelId : null;
}

function getConfiguredAgentId(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const agentId = (config as Record<string, unknown>).agent_id;
  return typeof agentId === "string" && agentId.length > 0 ? agentId : null;
}

function getPromptText(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const prompt = (config as Record<string, unknown>).prompt;
  return typeof prompt === "string" && prompt.trim().length > 0 ? prompt.trim() : null;
}

async function resolveProviderCredential(
  supabase: any,
  provider: string,
  linkedCredentialId?: string | null,
  ownerUserId?: string | null,
): Promise<string> {
  let credMeta: { id: string; owner_user_id?: string | null } | null = null;

  if (linkedCredentialId) {
    const { data } = await supabase
      .from("credentials_meta")
      .select("id, owner_user_id")
      .eq("id", linkedCredentialId)
      .eq("provider", provider)
      .eq("is_set", true);
    credMeta = pickOwnedRow(data || [], ownerUserId);
  }

  if (!credMeta) {
    const { data } = await supabase
      .from("credentials_meta")
      .select("id, owner_user_id")
      .eq("provider", provider)
      .eq("is_set", true);
    credMeta = pickOwnedRow(data || [], ownerUserId);
  }

  if (!credMeta) throw new Error(`No API key for provider "${provider}".`);

  const { data: credVals } = await supabase
    .from("credential_values")
    .select("encrypted_value, owner_user_id")
    .eq("credential_meta_id", credMeta.id);

  const credVal = pickOwnedRow(credVals || [], ownerUserId);

  if (!credVal?.encrypted_value) throw new Error(`API key not set for "${provider}".`);

  return decryptSecretIfNeeded(credVal.encrypted_value);
}

async function resolveModelRegistration(
  supabase: any,
  modelId: string,
  ownerUserId?: string | null,
) {
  const { data } = await supabase
    .from("model_registry")
    .select("provider, config, owner_user_id")
    .eq("model_id", modelId)
    .eq("is_active", true);

  return pickOwnedRow(data || [], ownerUserId);
}

function summarizeCronFacts(args: {
  agentId?: string | null;
  modelId?: string | null;
  schedule?: string | null;
  scheduleMode?: string | null;
  recurrenceRule?: string | null;
  responseText?: string | null;
  result?: unknown;
}) {
  const facts = [
    `- Agent: ${args.agentId || "secretary"}`,
    `- Model: ${args.modelId || "unknown"}`,
    `- Schedule: ${args.schedule || "not set"}`,
    `- Schedule mode: ${args.scheduleMode || "unknown"}`,
    `- Recurrence: ${args.recurrenceRule || "none"}`,
  ];

  if (typeof args.responseText === "string" && args.responseText.trim()) {
    facts.push(`- Response length: ${args.responseText.trim().length} characters`);
  }

  if (args.result && typeof args.result === "object") {
    facts.push(`- Structured result keys: ${Object.keys(args.result as Record<string, unknown>).join(", ") || "none"}`);
  }

  return facts.join("\n");
}

async function writeCronSummary(args: {
  job: Record<string, unknown>;
  runId?: string | null;
  status: "completed" | "failed";
  agentId?: string | null;
  modelId?: string | null;
  responseText?: string | null;
  result?: unknown;
  error?: string | null;
}) {
  const createdAt = new Date().toISOString();
  const jobName = typeof args.job.name === "string" ? args.job.name : "cron-job";
  const prompt = getPromptText(args.job.config);

  await writeRunSummaryFile({
    createdAt,
    agentId: "cron-scheduler",
    taskDomain: jobName,
    channel: "cron-jobs",
    status: args.status,
    frontmatter: {
      run_id: args.runId || "",
      job_id: args.job.id,
      created_at: createdAt,
      agent_id: "cron-scheduler",
      task_domain: jobName,
      channel: "cron-jobs",
      status: args.status,
    },
    sections: [
      { heading: "Objective", body: prompt || `Run the scheduled cron job "${jobName}".` },
      { heading: "Result", body: args.status === "completed" ? (args.responseText || JSON.stringify(args.result || {}, null, 2) || "Completed.") : (args.error || "The cron job failed.") },
      {
        heading: "Facts Learned",
        body: summarizeCronFacts({
          agentId: args.agentId,
          modelId: args.modelId,
          schedule: typeof args.job.schedule === "string" ? args.job.schedule : null,
          scheduleMode: typeof args.job.schedule_mode === "string" ? args.job.schedule_mode : null,
          recurrenceRule: typeof args.job.recurrence_rule === "string" ? args.job.recurrence_rule : null,
          responseText: args.responseText,
          result: args.result,
        }),
      },
      { heading: "Blockers", body: args.error ? `- ${args.error}` : "- None." },
      { heading: "Artifacts", body: "- None." },
    ],
  });
}

type ToolAgentRow = {
  agent_id: string;
  name: string;
  purpose: string;
  role: string;
  is_active: boolean;
  capability_tags: string[] | null;
  model: string | null;
  instructions_md: string | null;
};

type CodeToolCatalogRow = {
  agent_id: string;
  folder_path: string;
  tool_name: string;
  summary: string;
  execution_mode: "code" | "hybrid";
  classification_reason: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
};

type CodeToolFolderDocRow = {
  folder_path: string;
  folder_name: string;
  parent_path: string | null;
  depth: number;
  readme_title: string;
  readme_content: string;
  tool_count: number;
  child_folder_count: number;
};

const CODE_TOOL_ID_OVERRIDES: Record<string, { folder_path: string; execution_mode: "code" | "hybrid"; reason: string }> = {
  "memory-retriever": {
    folder_path: "runtime/context",
    execution_mode: "code",
    reason: "Known deterministic runtime context loader.",
  },
  "knowledge-loader": {
    folder_path: "runtime/context",
    execution_mode: "code",
    reason: "Known deterministic knowledge assembly tool.",
  },
  "agent-picker": {
    folder_path: "runtime/routing",
    execution_mode: "hybrid",
    reason: "Known routing helper with code-first selection logic.",
  },
  "privileged-writer": {
    folder_path: "runtime/execution",
    execution_mode: "code",
    reason: "Known protected write executor.",
  },
};

const CODE_TOOL_MARKERS = [
  "code-only",
  "code only",
  "code-first agent",
  "code-only infrastructure tool",
  "deterministic code operations",
  "does not use an llm model",
  "runs code logic",
  "minimal llm usage",
  "minimal llm",
];

function normalizeFolderPath(path?: string | null): string {
  if (!path) return "";
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function folderNameFromPath(path: string): string {
  if (!path) return "Tools";
  const last = path.split("/").at(-1) || path;
  return last
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parentFolderPath(path: string): string | null {
  const normalized = normalizeFolderPath(path);
  if (!normalized) return null;
  const parts = normalized.split("/");
  parts.pop();
  return parts.length ? parts.join("/") : "";
}

function scoreFolder(agent: ToolAgentRow, folderPath: string, keywords: string[]): number {
  const haystack = `${agent.agent_id} ${agent.name} ${agent.purpose} ${(agent.capability_tags || []).join(" ")} ${agent.instructions_md || ""}`.toLowerCase();
  return keywords.reduce((sum, keyword) => (haystack.includes(keyword) ? sum + 1 : sum), 0) + (haystack.includes(folderPath.split("/").at(-1) || "") ? 0.25 : 0);
}

function isCodeToolAgent(agent: ToolAgentRow): boolean {
  if (CODE_TOOL_ID_OVERRIDES[agent.agent_id]) return true;
  const haystack = `${agent.purpose} ${(agent.capability_tags || []).join(" ")} ${agent.instructions_md || ""}`.toLowerCase();
  return CODE_TOOL_MARKERS.some((marker) => haystack.includes(marker));
}

function inferExecutionMode(agent: ToolAgentRow): "code" | "hybrid" {
  const override = CODE_TOOL_ID_OVERRIDES[agent.agent_id];
  if (override) return override.execution_mode;

  const haystack = `${agent.purpose} ${(agent.capability_tags || []).join(" ")} ${agent.instructions_md || ""}`.toLowerCase();
  if (haystack.includes("code-first") || haystack.includes("minimal llm")) return "hybrid";
  return "code";
}

function inferFolderPath(agent: ToolAgentRow): string {
  const override = CODE_TOOL_ID_OVERRIDES[agent.agent_id];
  if (override) return override.folder_path;

  const folderCandidates = [
    { path: "runtime/context", keywords: ["memory", "context", "knowledge", "retriev", "loader"] },
    { path: "runtime/routing", keywords: ["route", "router", "pick", "selector", "classif"] },
    { path: "runtime/execution", keywords: ["write", "file system", "credential", "config", "security"] },
    { path: "runtime/misc", keywords: ["internal-tool", "tool"] },
  ];

  let bestPath = "runtime/misc";
  let bestScore = -1;

  for (const candidate of folderCandidates) {
    const score = scoreFolder(agent, candidate.path, candidate.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestPath = candidate.path;
    }
  }

  return bestPath;
}

function folderPurpose(folderPath: string): string {
  if (!folderPath) return "Top-level browser for all code-only tools.";
  if (folderPath.endsWith("context")) return "Context loading and retrieval tools that prepare execution state.";
  if (folderPath.endsWith("routing")) return "Routing and selection tools that decide where work goes next.";
  if (folderPath.endsWith("execution")) return "Protected execution tools that perform validated write operations.";
  if (folderPath.endsWith("misc")) return "Code-only tools that do not fit a more specific runtime bucket yet.";
  if (folderPath === "runtime") return "Internal runtime folders that organize code-only tools.";
  return "Auto-generated folder for code-only tool organization.";
}

function joinRelativePath(parentPath: string, childName: string): string {
  return parentPath ? `${parentPath}/${childName}` : childName;
}

function buildCatalog(agents: ToolAgentRow[]): CodeToolCatalogRow[] {
  return agents
    .filter(isCodeToolAgent)
    .map((agent) => {
      const override = CODE_TOOL_ID_OVERRIDES[agent.agent_id];
      return {
        agent_id: agent.agent_id,
        folder_path: inferFolderPath(agent),
        tool_name: agent.name,
        summary: agent.purpose,
        execution_mode: inferExecutionMode(agent),
        classification_reason: override?.reason || "Detected from code-only execution markers in the tool instructions.",
        sort_order: 0,
        metadata: {
          role: agent.role,
          capability_tags: agent.capability_tags || [],
          is_active: agent.is_active,
        },
      };
    })
    .sort((left, right) => {
      if (left.folder_path !== right.folder_path) return left.folder_path.localeCompare(right.folder_path);
      return left.tool_name.localeCompare(right.tool_name);
    })
    .map((entry, index) => ({ ...entry, sort_order: index }));
}

function buildFolderDocs(entries: CodeToolCatalogRow[]): CodeToolFolderDocRow[] {
  const folderPaths = new Set<string>([""]);

  for (const entry of entries) {
    let currentPath = "";
    for (const segment of normalizeFolderPath(entry.folder_path).split("/").filter(Boolean)) {
      currentPath = joinRelativePath(currentPath, segment);
      folderPaths.add(currentPath);
    }
  }

  return Array.from(folderPaths)
    .sort((left, right) => {
      const depthDiff = normalizeFolderPath(left).split("/").filter(Boolean).length - normalizeFolderPath(right).split("/").filter(Boolean).length;
      if (depthDiff !== 0) return depthDiff;
      return left.localeCompare(right);
    })
    .map((folderPath) => {
      const childFolders = Array.from(folderPaths).filter((candidate) => parentFolderPath(candidate) === folderPath);
      const tools = entries.filter((entry) => normalizeFolderPath(entry.folder_path) === folderPath);
      const lines = [
        `# ${folderPath ? `${folderNameFromPath(folderPath)}/` : "Tools/"}`,
        "",
        `Auto-generated summary for \`${folderPath || "/"}\`.`,
        "",
        "## Purpose",
        folderPurpose(folderPath),
        "",
      ];

      if (childFolders.length > 0) {
        lines.push("## Folders");
        for (const childPath of childFolders) {
          lines.push(`- \`${folderNameFromPath(childPath)}/\` - ${folderPurpose(childPath)}`);
        }
        lines.push("");
      }

      lines.push("## Tools");
      if (tools.length === 0) {
        lines.push("- No code tools are currently assigned to this folder.");
      } else {
        for (const tool of tools) {
          lines.push(`- \`${tool.tool_name}\` (\`${tool.agent_id}\`) - ${tool.summary}`);
        }
      }

      return {
        folder_path: folderPath,
        folder_name: folderNameFromPath(folderPath),
        parent_path: parentFolderPath(folderPath),
        depth: normalizeFolderPath(folderPath).split("/").filter(Boolean).length,
        readme_title: folderPath ? `${folderNameFromPath(folderPath)} README` : "Tools README",
        readme_content: lines.join("\n"),
        tool_count: tools.length,
        child_folder_count: childFolders.length,
      };
    });
}

async function runCodeToolOrganizer(supabase: any, job_id: string, run_id?: string) {
  const { data: agentRows, error: agentError } = await supabase
    .from("agents")
    .select("agent_id, name, purpose, role, is_active, capability_tags, model, instructions_md")
    .order("created_at", { ascending: true });

  if (agentError) throw agentError;

  const catalogRows = buildCatalog((agentRows || []) as ToolAgentRow[]);
  const folderDocs = buildFolderDocs(catalogRows);

  if (catalogRows.length > 0) {
    const { error } = await supabase.from("code_tool_catalog").upsert(catalogRows, { onConflict: "agent_id" });
    if (error) throw error;
  }

  const { data: existingCatalog } = await supabase.from("code_tool_catalog").select("agent_id");
  const obsoleteAgentIds = ((existingCatalog || []) as Array<{ agent_id: string }>)
    .map((row) => row.agent_id)
    .filter((agent_id) => !catalogRows.some((entry) => entry.agent_id === agent_id));

  if (obsoleteAgentIds.length > 0) {
    const { error } = await supabase.from("code_tool_catalog").delete().in("agent_id", obsoleteAgentIds);
    if (error) throw error;
  }

  if (folderDocs.length > 0) {
    const { error } = await supabase.from("code_tool_folder_docs").upsert(folderDocs, { onConflict: "folder_path" });
    if (error) throw error;
  }

  const { data: existingDocs } = await supabase.from("code_tool_folder_docs").select("folder_path");
  const obsoleteFolderPaths = ((existingDocs || []) as Array<{ folder_path: string }>)
    .map((row) => row.folder_path)
    .filter((folder_path) => !folderDocs.some((entry) => entry.folder_path === folder_path));

  if (obsoleteFolderPaths.length > 0) {
    const { error } = await supabase.from("code_tool_folder_docs").delete().in("folder_path", obsoleteFolderPaths);
    if (error) throw error;
  }

  const result = {
    tools: catalogRows.length,
    folders: folderDocs.length,
    generated_readmes: folderDocs.length,
    folder_paths: folderDocs.map((doc) => doc.folder_path || "/"),
  };

  if (run_id) {
    await supabase.from("cron_job_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result,
    }).eq("id", run_id);
  }

  await supabase.from("cron_jobs").update({ last_run_at: new Date().toISOString() }).eq("id", job_id);
  await supabase.from("chat_messages").insert([
    {
      role: "assistant",
      content: `[Cron: Weekly Tool Organizer] Organized ${catalogRows.length} tools into ${folderDocs.length} folders and refreshed ${folderDocs.length} README files.`,
      agent_id: "cron-scheduler",
    },
  ]);

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestBody = await req.json().catch(() => ({}));

  try {
    const caller = await getCallerContext(req);
    const { job_id, run_id } = requestBody;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch job config
    const { data: jobRows, error: jobErr } = await supabase
      .from("cron_jobs")
      .select("*")
      .eq("id", job_id);

    const job = pickOwnedRow(jobRows || [], caller.userId);

    if (jobErr || !job) {
      throw new Error(`Job not found: ${job_id}`);
    }

    if (caller.mode === "user" && job.owner_user_id && caller.userId !== job.owner_user_id) {
      throw new Error("Not authorized to run this job.");
    }

    const jobOwnerUserId = job.owner_user_id || caller.userId || null;

    // ── Special case: built-in summarize-memory job ──────────────────────────
    // Route to the dedicated Edge Function instead of a generic LLM prompt.
    if (job.function_name === "summarize-memory") {
      const fnUrl = `${supabaseUrl}/functions/v1/summarize-memory`;
      const fnResp = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ triggered_by: "cron", job_id, owner_user_id: jobOwnerUserId }),
      });

      const fnResult = await fnResp.json();
      const resultText = fnResp.ok
        ? `Memory summarization complete. Processed ${fnResult.processed ?? 0} messages. Agents: ${JSON.stringify(fnResult.agents ?? {})}`
        : `Summarization failed: ${fnResult.error ?? "Unknown error"}`;

      if (run_id) {
        await supabase.from("cron_job_runs").update({
          status: fnResp.ok ? "completed" : "failed",
          completed_at: new Date().toISOString(),
          result: fnResult,
        }).eq("id", run_id);
      }

      await supabase.from("cron_jobs").update({ last_run_at: new Date().toISOString() }).eq("id", job_id);
      await supabase.from("chat_messages").insert([
        { role: "assistant", content: `[Cron: Daily Memory Summarizer] ${resultText}`, agent_id: "cron-scheduler" },
      ]);

      await writeCronSummary({
        job,
        runId: run_id,
        status: fnResp.ok ? "completed" : "failed",
        result: fnResult,
        responseText: resultText,
        error: fnResp.ok ? null : (fnResult.error ?? "Unknown error"),
      });

      return new Response(JSON.stringify({ success: fnResp.ok, ...fnResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.function_name === "organize-code-tools") {
      const result = await runCodeToolOrganizer(supabase, job_id, run_id);
      await writeCronSummary({
        job,
        runId: run_id,
        status: "completed",
        agentId: "cron-scheduler",
        result,
        responseText: `Organized ${result.tools} tools into ${result.folders} folders.`,
      });
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const configuredAgentId = getConfiguredAgentId(job.config);
    const prompt = getPromptText(job.config)
      || (configuredAgentId
        ? "Run your scheduled work according to your instructions and current project state."
        : "Hello, run your scheduled task.");

    // Resolve scheduled agent for execution, or fall back to secretary for legacy jobs.
    const { data: agent } = await supabase
      .from("agents")
      .select("*")
      .eq("agent_id", configuredAgentId || "secretary")
      .maybeSingle();

    if (!agent) {
      throw new Error(configuredAgentId
        ? `Scheduled agent "${configuredAgentId}" was not found.`
        : "Cron executor could not load the secretary agent.");
    }

    const selectedModelId = getConfiguredModelId(job.config) || agent?.model || null;

    if (!selectedModelId) throw new Error("Cron executor has no model configured.");

    const modelReg = await resolveModelRegistration(supabase, selectedModelId, jobOwnerUserId);

    const provider = modelReg?.provider?.toLowerCase() || "google";
    const apiKey = await resolveProviderCredential(
      supabase,
      provider,
      getLinkedCredentialId(modelReg),
      jobOwnerUserId,
    );

    // Call the LLM
    const systemPrompt = agent.instructions_md || "You are a helpful assistant executing a scheduled task.";
    const messages = [
      { role: "system", content: systemPrompt + "\n\nThis is a scheduled cron job execution. Complete the task and provide a concise result." },
      { role: "user", content: prompt },
    ];

    let responseText = "";

    if (provider === "google" || provider === "gemini") {
      const modelId = selectedModelId;
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
        openrouter: `${OPENROUTER_BASE_URL}/chat/completions`,
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
      } else if (provider === "openrouter") {
        Object.assign(headers, getOpenRouterHeaders(apiKey));
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      let body: string;
      if (provider === "anthropic") {
        const sys = messages.find(m => m.role === "system")?.content || "";
        const nonSys = messages.filter(m => m.role !== "system");
        body = JSON.stringify({ model: selectedModelId, system: sys, messages: nonSys, max_tokens: 4096 });
      } else {
        body = JSON.stringify({ model: selectedModelId, messages });
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
      { role: "assistant", content: responseText, agent_id: agent.agent_id || "secretary" },
    ]);

    // Update job last_run_at
    await supabase.from("cron_jobs").update({ last_run_at: new Date().toISOString() }).eq("id", job_id);

    await writeCronSummary({
      job,
      runId: run_id,
      status: "completed",
      agentId: agent.agent_id || "secretary",
      modelId: selectedModelId,
      responseText,
      result: { response: responseText.slice(0, 5000) },
    });

    return new Response(JSON.stringify({ success: true, response: responseText.slice(0, 500) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cron-execute error:", e);

    // Try to update the run as failed
    try {
      const { run_id, job_id } = requestBody as { run_id?: string; job_id?: string };
      if (run_id) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase.from("cron_job_runs").update({
          status: "failed", completed_at: new Date().toISOString(),
          error: e instanceof Error ? e.message : "Unknown error",
        }).eq("id", run_id);

        if (job_id) {
          const { data: jobRows } = await supabase
            .from("cron_jobs")
            .select("*")
            .eq("id", job_id)
            .limit(1);
          const job = jobRows?.[0] || null;
          if (job) {
            await writeCronSummary({
              job,
              runId: run_id,
              status: "failed",
              agentId: getConfiguredAgentId(job.config) || "secretary",
              modelId: getConfiguredModelId(job.config),
              error: e instanceof Error ? e.message : "Unknown error",
            });
          }
        }
      }
    } catch { /* best effort */ }

    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message === "Not authorized to run this job." ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
