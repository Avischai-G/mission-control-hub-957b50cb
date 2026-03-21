import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ensureDir, exists } from "https://deno.land/std@0.168.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.168.0/path/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { decryptSecretIfNeeded } from "../_shared/credential-security.ts";
import {
  ensureAgentPromptFile,
  readTextFileIfExists,
  tokenEstimateForText,
  writeRunSummaryFile,
} from "../_shared/claw-workspace.ts";

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

function slugifyTopicKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "topic";
}

async function ensureRandomConversation(supabase: any, userId: string): Promise<ConversationRow> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, owner_user_id, kind, title, topic_key, archived_at, last_message_at")
    .eq("owner_user_id", userId)
    .eq("kind", "random")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as ConversationRow;
  }

  const { data: inserted, error } = await supabase
    .from("conversations")
    .insert({
      owner_user_id: userId,
      kind: "random",
      title: "Random Chat",
      topic_key: "random",
      last_message_at: new Date().toISOString(),
    })
    .select("id, owner_user_id, kind, title, topic_key, archived_at, last_message_at")
    .single();

  if (error) throw error;
  return inserted as ConversationRow;
}

async function resolveConversation(
  supabase: any,
  userId: string,
  requestedConversationId?: string | null,
): Promise<ConversationRow> {
  if (!requestedConversationId) {
    return await ensureRandomConversation(supabase, userId);
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id, owner_user_id, kind, title, topic_key, archived_at, last_message_at")
    .eq("id", requestedConversationId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as ConversationRow;
  return await ensureRandomConversation(supabase, userId);
}

async function touchConversation(supabase: any, conversationId: string, timestamp: string) {
  await supabase
    .from("conversations")
    .update({ last_message_at: timestamp })
    .eq("id", conversationId);
}

function inferContextWindowTokens(modelId: string | null | undefined) {
  const normalized = (modelId || "").toLowerCase();
  if (normalized.includes("haiku")) return 200_000;
  if (normalized.includes("sonnet")) return 200_000;
  if (normalized.includes("gemini")) return 1_000_000;
  if (normalized.includes("deepseek")) return 128_000;
  return 128_000;
}

function inferDefaultOutputTokens(modelId: string | null | undefined) {
  const normalized = (modelId || "").toLowerCase();
  if (normalized.includes("gemini")) return 8_192;
  if (normalized.includes("sonnet")) return 8_192;
  return 4_096;
}

function buildContextEstimateMeta(args: {
  prompt: string;
  contextBlock: string;
  modelId: string;
  modelMeta?: Record<string, unknown> | null;
}) {
  const contextWindowTokens =
    typeof args.modelMeta?.context_window_tokens === "number"
      ? Number(args.modelMeta.context_window_tokens)
      : inferContextWindowTokens(args.modelId);
  const defaultOutputTokens =
    typeof args.modelMeta?.default_output_tokens === "number"
      ? Number(args.modelMeta.default_output_tokens)
      : inferDefaultOutputTokens(args.modelId);
  const promptTokens = tokenEstimateForText(args.prompt);
  const contextTokens = tokenEstimateForText(args.contextBlock);
  const historyBudgetTokens = 3_000;
  const usedTokens = promptTokens + contextTokens + historyBudgetTokens + defaultOutputTokens;

  return {
    contextWindowTokens,
    defaultOutputTokens,
    estimatedUsedTokens: usedTokens,
  };
}

const UNIVERSAL_EXECUTOR_AGENT_ID = "universal-executor";

const NORMAL_CHAT_EXCLUDED_AGENT_IDS = new Set([
  "secretary",
  "orchestrator",
  "context-agent",
  "website-brief-normalizer",
  "website-html-builder",
  "presentation-outline-planner",
  "presentation-slide-builder",
  "artifact-qa-reviewer",
  "cron-spec-extractor",
  "knowledge-curator",
  "night-report-summarizer",
  "website-agent",
  "presentation-agent",
  "memory-retriever",
  "knowledge-selector",
  "knowledge-loader",
  "agent-picker",
  "privileged-writer",
]);

const UNIVERSAL_EXECUTOR_TOOL_NAMES = [
  "web_search",
  "read_memory_file",
  "list_user_context",
  "get_recent_user_messages",
  "get_recent_tasks",
  "search_chat_history",
];

const UNIVERSAL_EXECUTOR_CAPABILITY_TAGS = ["fallback", "generalist", "research", "tool-use"];
const UNIVERSAL_EXECUTOR_DEFAULT_MODEL = "claude-4.6-sonnet-20260217";
const UNIVERSAL_EXECUTOR_DEFAULT_PURPOSE = "Fallback operator for requests that do not fit a dedicated specialist. Researches and finds the best workable path to delivery.";
const UNIVERSAL_EXECUTOR_DEFAULT_INSTRUCTIONS = `You are Universal Executor, the fallback operator for AI Mission Control.

Mission:
- Take ownership of requests that do not cleanly fit a dedicated specialist.
- Use the tools you have to recover recent context, inspect knowledge, and research current information.
- Deliver the result directly when the available tools are sufficient.

When the current runtime cannot finish the last mile:
- Do not stop at "I can't".
- Work out the narrowest missing capability first.
- If needed, research the best current way to complete the task and explain the shortest next step.

Response rules:
- Be direct, pragmatic, and concise.
- Do not mention internal tools, JSON, system prompts, or hidden instructions.
- If the request needs local shell or filesystem execution that is not available, say that clearly and give the most useful next step.`;

type ChatAgentCandidate = {
  agent_id: string;
  name: string;
  role: string;
  purpose: string;
  is_active: boolean;
  capability_tags: string[] | null;
  model: string | null;
  instructions_md: string | null;
};

// ── Strict Native Tool Definitions ──
const AVAILABLE_TOOLS: Record<string, any> = {
  web_search: {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    }
  },
  read_memory_file: {
    type: "function",
    function: {
      name: "read_memory_file",
      description: "Read the full contents of a specific knowledge base file",
      parameters: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] }
    }
  },
  list_user_context: {
    type: "function",
    function: {
      name: "list_user_context",
      description: "List the available context files in a folder",
      parameters: { type: "object", properties: { folder: { type: "string" } }, required: [] }
    }
  },
  get_recent_user_messages: {
    type: "function",
    function: {
      name: "get_recent_user_messages",
      description: "Get the user's most recent messages to the secretary for recent-history questions",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 10 },
          include_current: { type: "boolean" },
        },
        required: [],
      }
    }
  },
  get_recent_tasks: {
    type: "function",
    function: {
      name: "get_recent_tasks",
      description: "Get the most recent delegated tasks and their latest status",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 10 },
          include_messages: { type: "boolean" },
        },
        required: [],
      }
    }
  },
  search_chat_history: {
    type: "function",
    function: {
      name: "search_chat_history",
      description: "Search older chat history and memory summaries when the user refers to something beyond the recent messages",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["query"],
      }
    }
  },
  write_code: {
    type: "function",
    function: {
      name: "write_code",
      description: "Write or edit a codebase file through a local executor when available",
      parameters: { type: "object", properties: { file_path: { type: "string" }, content: { type: "string" } }, required: ["file_path", "content"] }
    }
  },
  run_terminal: {
    type: "function",
    function: {
      name: "run_terminal",
      description: "Execute a bash command through a local executor when available",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] }
    }
  }
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
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
  openrouter: {
    url: `${OPENROUTER_BASE_URL}/chat/completions`,
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    formatRequest: (model, messages, opts) => {
      const sys = messages.find((m: any) => m.role === "system")?.content || "";
      const nonSys = messages.filter((m: any) => m.role !== "system");
      const tools = opts?.tools?.length ? opts.tools.map((t: any) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      })) : undefined;
      return {
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, system: sys, messages: nonSys, max_tokens: 4096, stream: opts?.stream ?? false, tools }),
      };
    },
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    formatRequest: (model, messages, opts) => {
      const sys = messages.find((m: any) => m.role === "system")?.content || "";
      const nonSys = messages.filter((m: any) => m.role !== "system");
      const tools = opts?.tools?.length ? [{
        functionDeclarations: opts.tools.map((t: any) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }))
      }] : undefined;
      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: nonSys.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          tools
        }),
      };
    },
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    formatRequest: (model, messages, opts) => {
      const sys = messages.find((m: any) => m.role === "system")?.content || "";
      const nonSys = messages.filter((m: any) => m.role !== "system");
      const tools = opts?.tools?.length ? [{
        functionDeclarations: opts.tools.map((t: any) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }))
      }] : undefined;
      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: nonSys.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          tools
        }),
      };
    },
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
  together: {
    url: "https://api.together.xyz/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
  fireworks: {
    url: "https://api.fireworks.ai/inference/v1/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
  perplexity: {
    url: "https://api.perplexity.ai/chat/completions",
    formatRequest: (model, messages, opts) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: opts?.stream ?? false, tools: opts?.tools?.length ? opts.tools : undefined }),
    }),
  },
};

function getLinkedCredentialId(modelReg: { config?: Record<string, unknown> | null } | null | undefined): string | null {
  const config = modelReg?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const credentialId = (config as Record<string, unknown>).credential_id;
  return typeof credentialId === "string" && credentialId.length > 0 ? credentialId : null;
}

async function resolveProviderCredential(
  supabase: any,
  provider: string,
  linkedCredentialId?: string | null,
  ownerUserId?: string | null,
): Promise<{ credentialId: string; apiKey: string }> {
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

  if (!credMeta) {
    throw new Error(`No API key for provider "${provider}". Add one in Setup → Credentials.`);
  }

  const { data: credVals } = await supabase
    .from("credential_values")
    .select("encrypted_value, owner_user_id")
    .eq("credential_meta_id", credMeta.id);

  const credVal = pickOwnedRow(credVals || [], ownerUserId);

  if (!credVal?.encrypted_value) {
    throw new Error(`API key for "${provider}" not set.`);
  }

  return {
    credentialId: credMeta.id,
    apiKey: await decryptSecretIfNeeded(credVal.encrypted_value),
  };
}

async function resolveModelRegistration(
  supabase: any,
  modelId: string,
  ownerUserId?: string | null,
) {
  const { data } = await supabase
    .from("model_registry")
    .select("provider, config, owner_user_id, context_window_tokens, default_output_tokens, display_name")
    .eq("model_id", modelId)
    .eq("is_active", true);

  return pickOwnedRow(data || [], ownerUserId);
}

function shouldLoadStructuredKnowledge(category: string, userMessage: string): boolean {
  if (category !== "website" && category !== "presentation") return false;

  const normalized = userMessage.toLowerCase();
  const personalPatterns = [
    /\babout me\b/,
    /\babout myself\b/,
    /\bmy portfolio\b/,
    /\bportfolio\b/,
    /\bpersonal (site|website|page)\b/,
    /\bmy (resume|cv|work|projects|experience|services|company|business|brand|profile|bio)\b/,
    /\bsite about me\b/,
  ];

  return personalPatterns.some((pattern) => pattern.test(normalized));
}

type ArtifactPayload = {
  id: string;
  type: "website" | "presentation";
  label: string;
  html: string;
  createdAt: string;
  url?: string;
  filePath?: string;
  fileName?: string;
};

type SpecialistCategory = "website" | "presentation";

type SpecialistFlowConfig = {
  plannerAgentId: string;
  plannerTitle: string;
  plannerOutputLabel: string;
  builderAgentId: string;
  builderTitle: string;
  artifactType: "website" | "presentation";
  artifactLabel: string;
};

type QaDefect = {
  severity: string;
  area: string;
  issue: string;
  fix: string;
};

type QaReview = {
  pass: boolean;
  defects: QaDefect[];
};

type CronSpec = {
  name?: string;
  schedule?: string;
  prompt?: string;
  needs_clarification?: boolean;
  question?: string;
};

type ToolCallRequest = {
  name: string;
  args?: Record<string, unknown>;
};

type ToolExecutionContext = {
  supabase: any;
  currentUserMessageId?: string | null;
  conversationId?: string | null;
  allowedToolNames?: Set<string>;
  agentId?: string;
};

type RecentTaskSummary = {
  id: string;
  title: string;
  goal: string | null;
  task_type: string | null;
  status: string;
  status_summary: string;
  assigned_agent_id: string | null;
  created_at: string;
  updated_at: string;
  result_summary: string | null;
  recent_messages?: Array<{
    role: string;
    agent_id: string | null;
    content: string;
    created_at: string;
  }>;
};

type ConversationRow = {
  id: string;
  owner_user_id: string | null;
  kind: "random" | "topic";
  title: string;
  topic_key: string | null;
  archived_at: string | null;
  last_message_at: string;
};

const SPECIALIST_FLOWS: Record<SpecialistCategory, SpecialistFlowConfig> = {
  website: {
    plannerAgentId: "website-brief-normalizer",
    plannerTitle: "Normalizing website brief",
    plannerOutputLabel: "website brief",
    builderAgentId: "website-html-builder",
    builderTitle: "Building website",
    artifactType: "website",
    artifactLabel: "Website",
  },
  presentation: {
    plannerAgentId: "presentation-outline-planner",
    plannerTitle: "Planning presentation outline",
    plannerOutputLabel: "presentation outline",
    builderAgentId: "presentation-slide-builder",
    builderTitle: "Building presentation",
    artifactType: "presentation",
    artifactLabel: "Presentation",
  },
};

function getAuthHeader(provider: string, apiKey: string): Record<string, string> {
  if (provider === "anthropic") return { "x-api-key": apiKey };
  if (provider === "openrouter") return getOpenRouterHeaders(apiKey);
  if (provider === "google" || provider === "gemini") return {};
  return { Authorization: `Bearer ${apiKey}` };
}

function stripCodeFences(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function extractJsonFragment(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return cleaned.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return cleaned.slice(arrayStart, arrayEnd + 1);
  }

  return null;
}

function parseJsonResponse<T>(raw: string): T | null {
  const direct = stripCodeFences(raw);
  for (const candidate of [direct, extractJsonFragment(raw)].filter(Boolean) as string[]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function cleanHtmlArtifact(raw: string): string {
  return stripCodeFences(raw).trim();
}

function toSlugWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildWebsiteBaseWords(structuredPlan: Record<string, unknown>, userMessage: string): string[] {
  const candidateSources = [
    typeof structuredPlan.site_title === "string" ? structuredPlan.site_title : "",
    typeof structuredPlan.primary_goal === "string" ? structuredPlan.primary_goal : "",
    userMessage,
  ];

  for (const source of candidateSources) {
    const words = toSlugWords(source).slice(0, 3);
    if (words.length > 0) return words;
  }

  return ["website"];
}

async function saveWebsiteToDocuments(
  html: string,
  structuredPlan: Record<string, unknown>,
  userMessage: string,
  taskId: string,
  supabaseUrl: string,
): Promise<{ filePath: string; fileName: string; openUrl: string }> {
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    throw new Error("HOME is not available, so the website cannot be saved to Documents.");
  }

  const websitesDir = join(homeDir, "Documents", "websites");
  await ensureDir(websitesDir);

  const baseWords = buildWebsiteBaseWords(structuredPlan, userMessage);
  const dateSuffix = new Date().toISOString().slice(0, 10);

  let fileName = `${baseWords.join("-")}-${dateSuffix}.html`;
  let filePath = join(websitesDir, fileName);
  let version = 2;

  while (await exists(filePath)) {
    fileName = `${baseWords.join("-")}-v${version}-${dateSuffix}.html`;
    filePath = join(websitesDir, fileName);
    version += 1;
  }

  await Deno.writeTextFile(filePath, html);

  return {
    filePath,
    fileName,
    openUrl: `${supabaseUrl}/functions/v1/open-website?taskId=${taskId}`,
  };
}

function doneAction(agent: string, title: string, output?: string) {
  return output ? { agent, title, status: "done" as const, output } : { agent, title, status: "done" as const };
}

function runningAction(agent: string, title: string) {
  return { agent, title, status: "running" as const };
}

function failedAction(agent: string, title: string, output?: string) {
  return output ? { agent, title, status: "failed" as const, output } : { agent, title, status: "failed" as const };
}

function normalizeReview(raw: QaReview | null | undefined): QaReview {
  const defects = Array.isArray(raw?.defects)
    ? raw!.defects
        .filter((defect) => defect && typeof defect.issue === "string")
        .map((defect) => ({
          severity: typeof defect.severity === "string" ? defect.severity.toLowerCase() : "low",
          area: typeof defect.area === "string" ? defect.area : "artifact",
          issue: defect.issue,
          fix: typeof defect.fix === "string" ? defect.fix : "",
        }))
    : [];

  const hasBlocking = defects.some((defect) => defect.severity === "high" || defect.severity === "medium");
  return {
    pass: typeof raw?.pass === "boolean" ? raw.pass : !hasBlocking,
    defects,
  };
}

function hasBlockingDefects(review: QaReview): boolean {
  return review.defects.some((defect) => defect.severity === "high" || defect.severity === "medium");
}

function summarizeReview(review: QaReview): string {
  if (!review.defects.length) return "No defects found";

  const counts = review.defects.reduce(
    (acc, defect) => {
      if (defect.severity === "high") acc.high += 1;
      else if (defect.severity === "medium") acc.medium += 1;
      else acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );

  const parts = [];
  if (counts.high) parts.push(`${counts.high} high`);
  if (counts.medium) parts.push(`${counts.medium} medium`);
  if (counts.low) parts.push(`${counts.low} low`);
  return `${parts.join(", ")} issue(s)`;
}

function formatDefectList(defects: QaDefect[]): string {
  return defects
    .map(
      (defect, index) =>
        `${index + 1}. [${defect.severity.toUpperCase()}] ${defect.area}: ${defect.issue}${defect.fix ? `\nFix: ${defect.fix}` : ""}`,
    )
    .join("\n");
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

async function callLLM(provider: string, model: string, apiKey: string, messages: any[], opts?: { tools?: any[] }): Promise<string> {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) throw new Error(`No config for provider: ${provider}`);
  const { body, headers } = config.formatRequest(model, messages, { stream: false, tools: opts?.tools });
  const url = getProviderUrl(provider, model, apiKey, false);
  const resp = await fetch(url, { method: "POST", headers: { ...headers, ...getAuthHeader(provider, apiKey) }, body });
  if (!resp.ok) { const t = await resp.text(); throw new Error(`LLM error ${resp.status}: ${t.slice(0, 300)}`); }
  const data = await resp.json();
  
  if (provider === "google" || provider === "gemini") {
    const calls = data.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall);
    if (calls?.length) return JSON.stringify({ tool_calls: calls.map((c: any) => ({ name: c.functionCall.name, args: c.functionCall.args })) });
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  
  if (provider === "anthropic") {
    if (data.stop_reason === "tool_use") {
      const calls = data.content.filter((c: any) => c.type === "tool_use");
      return JSON.stringify({ tool_calls: calls.map((c: any) => ({ name: c.name, args: c.input })) });
    }
    return data.content?.[0]?.text || "";
  }
  
  if (data.choices?.[0]?.message?.tool_calls?.length) {
    const calls = data.choices[0].message.tool_calls;
    return JSON.stringify({ tool_calls: calls.map((c: any) => ({ name: c.function.name, args: JSON.parse(c.function.arguments) })) });
  }
  return data.choices?.[0]?.message?.content || "";
}

async function resolveAgent(supabase: any, agentId: string, ownerUserId?: string | null) {
  const { data: agent } = await supabase.from("agents").select("*").eq("agent_id", agentId).single();
  if (!agent) throw new Error(`Agent "${agentId}" not found`);
  if (!agent.model) throw new Error(`Agent "${agentId}" has no model configured`);
  const modelId = agent.model;
  const modelReg = await resolveModelRegistration(supabase, modelId, ownerUserId);
  const provider = modelReg ? modelReg.provider.toLowerCase() : "openai";
  const { apiKey } = await resolveProviderCredential(
    supabase,
    provider,
    getLinkedCredentialId(modelReg),
    ownerUserId,
  );

  const { data: policy } = await supabase.from("agent_policies").select("allowed_tools").eq("agent_id", agentId).maybeSingle();
  const allowedTools = (policy?.allowed_tools?.length
    ? policy.allowed_tools
    : agentId === UNIVERSAL_EXECUTOR_AGENT_ID
      ? UNIVERSAL_EXECUTOR_TOOL_NAMES
      : []) as string[];
  
  const parsedTools = allowedTools
    .map((tName: string) => AVAILABLE_TOOLS[tName])
    .filter(Boolean);

  const promptPath = await ensureAgentPromptFile(agentId, agent.instructions_md || `# ${agent.name}\n`);
  const promptContent = await readTextFileIfExists(promptPath, agent.instructions_md || "");

  return {
    agent: {
      ...agent,
      instructions_md: promptContent || agent.instructions_md,
    },
    modelId,
    provider,
    apiKey,
    tools: parsedTools,
    allowedToolNames: allowedTools,
    modelMeta: modelReg || null,
    promptPath,
  };
}

async function ensureUniversalExecutorSeed(supabase: any) {
  const { data: existingAgent } = await supabase
    .from("agents")
    .select("agent_id")
    .eq("agent_id", UNIVERSAL_EXECUTOR_AGENT_ID)
    .maybeSingle();

  if (!existingAgent) {
    const { error } = await supabase.from("agents").insert({
      agent_id: UNIVERSAL_EXECUTOR_AGENT_ID,
      name: "Universal Executor",
      role: "core",
      purpose: UNIVERSAL_EXECUTOR_DEFAULT_PURPOSE,
      is_active: true,
      capability_tags: UNIVERSAL_EXECUTOR_CAPABILITY_TAGS,
      model: UNIVERSAL_EXECUTOR_DEFAULT_MODEL,
      instructions_md: UNIVERSAL_EXECUTOR_DEFAULT_INSTRUCTIONS,
    });
    if (error) throw new Error(`Failed to seed ${UNIVERSAL_EXECUTOR_AGENT_ID}: ${error.message}`);
  }

  const { data: existingPolicy } = await supabase
    .from("agent_policies")
    .select("agent_id")
    .eq("agent_id", UNIVERSAL_EXECUTOR_AGENT_ID)
    .maybeSingle();

  if (!existingPolicy) {
    const { error } = await supabase.from("agent_policies").insert({
      agent_id: UNIVERSAL_EXECUTOR_AGENT_ID,
      allowed_tools: UNIVERSAL_EXECUTOR_TOOL_NAMES,
    });
    if (error) throw new Error(`Failed to seed ${UNIVERSAL_EXECUTOR_AGENT_ID} policy: ${error.message}`);
  }
}

function routingTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3),
    ),
  );
}

function isSelectableChatAgent(agent: ChatAgentCandidate): boolean {
  if (!agent.is_active || !agent.model || !agent.instructions_md) return false;
  if (agent.agent_id === UNIVERSAL_EXECUTOR_AGENT_ID) return true;
  if (NORMAL_CHAT_EXCLUDED_AGENT_IDS.has(agent.agent_id)) return false;

  const tags = (agent.capability_tags || []).map((tag) => tag.toLowerCase());
  if (tags.includes("internal-tool")) return false;

  return true;
}

function scoreChatAgentCandidate(agent: ChatAgentCandidate, userMessage: string): number {
  const normalizedMessage = userMessage.toLowerCase();
  const messageTokens = routingTokens(userMessage);
  const haystackTokens = {
    tags: routingTokens((agent.capability_tags || []).join(" ")),
    purpose: routingTokens(agent.purpose || ""),
    name: routingTokens(agent.name || ""),
    id: routingTokens(agent.agent_id || ""),
  };

  let score = agent.agent_id === UNIVERSAL_EXECUTOR_AGENT_ID ? 0.5 : 0;

  if (normalizedMessage.includes(agent.agent_id.toLowerCase())) score += 20;

  const normalizedName = agent.name.toLowerCase();
  if (normalizedName && normalizedMessage.includes(normalizedName)) score += 18;

  for (const token of messageTokens) {
    if (haystackTokens.tags.includes(token)) score += 4;
    if (haystackTokens.purpose.includes(token)) score += 2.5;
    if (haystackTokens.name.includes(token)) score += 2;
    if (haystackTokens.id.includes(token)) score += 1.5;
  }

  if (agent.role === "specialist") score += 0.25;

  return score;
}

async function selectBestChatAgent(
  supabase: any,
  userMessage: string,
  selectorInfo: { provider: string; modelId: string; apiKey: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("agents")
    .select("agent_id, name, role, purpose, is_active, capability_tags, model, instructions_md")
    .eq("is_active", true);

  if (error) throw new Error(`Failed to load chat agents: ${error.message}`);

  const candidates = ((data || []) as ChatAgentCandidate[]).filter(isSelectableChatAgent);
  const fallbackAgent = candidates.find((agent) => agent.agent_id === UNIVERSAL_EXECUTOR_AGENT_ID) || null;
  const specialists = candidates
    .filter((agent) => agent.agent_id !== UNIVERSAL_EXECUTOR_AGENT_ID)
    .map((agent) => ({ agent, score: scoreChatAgentCandidate(agent, userMessage) }))
    .sort((left, right) => right.score - left.score);

  if (!specialists.length) {
    return fallbackAgent?.agent_id || "secretary";
  }

  const strongMatches = specialists.filter((entry) => entry.score >= 4);
  if (!strongMatches.length) {
    return fallbackAgent?.agent_id || specialists[0].agent.agent_id;
  }

  const [topMatch, secondMatch] = strongMatches;
  if (topMatch.score >= 10 && (!secondMatch || topMatch.score - secondMatch.score >= 5)) {
    return topMatch.agent.agent_id;
  }

  const shortlist = [
    ...strongMatches.slice(0, 4).map((entry) => entry.agent),
    ...(fallbackAgent ? [fallbackAgent] : []),
  ];

  try {
    const selectionResult = await callLLM(
      selectorInfo.provider,
      selectorInfo.modelId,
      selectorInfo.apiKey,
      [
        {
          role: "system",
          content: [
            "You select the best agent for a normal chat request.",
            "Choose a specialist only when its purpose and capability tags clearly match the request better than the fallback.",
            `If the request is broad, ambiguous, multi-step, or no specialist obviously fits, choose "${UNIVERSAL_EXECUTOR_AGENT_ID}".`,
            'Return ONLY valid JSON in this shape: {"agent_id":"..."}',
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `User request: ${userMessage}`,
            "",
            "Available agents:",
            shortlist
              .map((agent) => {
                const tags = agent.capability_tags?.join(", ") || "none";
                return `- ${agent.agent_id} | ${agent.name} | role=${agent.role} | tags=${tags} | purpose=${agent.purpose}`;
              })
              .join("\n"),
          ].join("\n"),
        },
      ],
    );

    const parsedSelection = parseJsonResponse<{ agent_id?: string }>(selectionResult);
    if (parsedSelection?.agent_id && shortlist.some((agent) => agent.agent_id === parsedSelection.agent_id)) {
      return parsedSelection.agent_id;
    }
  } catch {
    // Fall back to deterministic scoring below.
  }

  if (topMatch.score >= 7 && (!secondMatch || topMatch.score - secondMatch.score >= 3)) {
    return topMatch.agent.agent_id;
  }

  return fallbackAgent?.agent_id || topMatch.agent.agent_id;
}

// ── Embedding generation ──────────────────────────────────────────────────────
async function embedText(text: string, provider: string, apiKey: string): Promise<number[] | null> {
  try {
    if (provider === "google" || provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.embedding?.values || null;
    }
    if (provider === "openai") {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.data?.[0]?.embedding || null;
    }
    if (provider === "openrouter") {
      const resp = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getOpenRouterHeaders(apiKey) },
        body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.data?.[0]?.embedding || null;
    }
    return null;
  } catch {
    return null;
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number"
    ? Math.floor(value)
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function shortenText(value: unknown, maxLength = 320): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function unwrapDuckDuckGoUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return rawUrl;
  }
}

function summarizeTaskStatus(status: string): string {
  const summaries: Record<string, string> = {
    received: "received and waiting for the specialist flow",
    classified: "classified and queued for specialist execution",
    recent_context_ready: "recent context prepared",
    long_term_context_ready: "long-term context prepared",
    agent_selected: "specialist selected",
    specialist_running: "currently being worked on by the specialist",
    specialist_self_check_passed: "artifact built and internal QA passed",
    orchestrator_review_passed: "orchestrator review passed",
    final_action_done: "final action completed",
    reported_to_secretary: "completed and ready to report back",
    failed: "failed",
    cancelled: "cancelled",
  };
  return summaries[status] || status.replace(/_/g, " ");
}

function summarizeTaskResult(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label : null;
  const type = typeof record.type === "string" ? record.type : null;
  const localArtifactId = typeof record.local_artifact_id === "string" ? record.local_artifact_id : null;
  const qaReview = record.qa_review && typeof record.qa_review === "object" && !Array.isArray(record.qa_review)
    ? record.qa_review as Record<string, unknown>
    : null;

  const parts: string[] = [];
  if (label) parts.push(label);
  else if (type) parts.push(type);
  if (localArtifactId) parts.push(`artifact ${localArtifactId}`);
  if (typeof qaReview?.pass === "boolean") {
    parts.push(qaReview.pass ? "QA passed" : "QA flagged issues");
  }
  return parts.length ? parts.join(" · ") : null;
}

function sanitizeSearchTerm(query: string): string {
  return query.replace(/[%_]+/g, " ").replace(/\s+/g, " ").trim();
}

function scoreTaskMatch(task: { title?: string | null; goal?: string | null; task_type?: string | null; status?: string | null }, query: string): number {
  if (!query) return 0;
  const haystack = `${task.title || ""} ${task.goal || ""} ${task.task_type || ""} ${task.status || ""}`.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (!haystack) return 0;

  let score = 0;
  if (haystack.includes(normalizedQuery)) score += 12;

  for (const token of normalizedQuery.split(/[^a-z0-9]+/).filter((part) => part.length >= 3)) {
    if (haystack.includes(token)) score += 3;
  }

  return score;
}

async function getRecentUserMessages(
  supabase: any,
  opts?: { limit?: unknown; excludeMessageId?: string | null; conversationId?: string | null },
): Promise<Array<{ created_at: string; content: string; task_id: string | null }>> {
  const limit = clampInt(opts?.limit, 1, 10, 10);
  let query = supabase
    .from("chat_messages")
    .select("id, content, created_at, task_id")
    .eq("role", "user")
    .eq("agent_id", "secretary")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts?.excludeMessageId) {
    query = query.neq("id", opts.excludeMessageId);
  }
  if (opts?.conversationId) {
    query = query.eq("conversation_id", opts.conversationId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load recent user messages: ${error.message}`);

  return (data || []).map((message: any) => ({
    created_at: message.created_at,
    content: shortenText(message.content, 480),
    task_id: message.task_id || null,
  }));
}

async function getRecentTasks(
  supabase: any,
  opts?: { limit?: unknown; query?: unknown; includeMessages?: unknown; conversationId?: string | null },
): Promise<{ query: string | null; matched: boolean; tasks: RecentTaskSummary[] }> {
  const limit = clampInt(opts?.limit, 1, 10, 5);
  const searchQuery = typeof opts?.query === "string" ? opts.query.trim() : "";
  const includeMessages = opts?.includeMessages !== false;

  let tasksQuery = supabase
    .from("tasks")
    .select("id, title, goal, task_type, status, assigned_agent_id, created_at, updated_at, result")
    .order("updated_at", { ascending: false })
    .limit(25);

  if (opts?.conversationId) {
    tasksQuery = tasksQuery.eq("conversation_id", opts.conversationId);
  }

  const { data, error } = await tasksQuery;

  if (error) throw new Error(`Failed to load recent tasks: ${error.message}`);

  const allTasks = (data || []) as Array<Record<string, unknown>>;
  const ranked = allTasks
    .map((task) => ({
      task,
      score: scoreTaskMatch(
        {
          title: typeof task.title === "string" ? task.title : null,
          goal: typeof task.goal === "string" ? task.goal : null,
          task_type: typeof task.task_type === "string" ? task.task_type : null,
          status: typeof task.status === "string" ? task.status : null,
        },
        searchQuery,
      ),
    }))
    .sort((left, right) => right.score - left.score);

  const matchedTasks = searchQuery
    ? ranked.filter((entry) => entry.score > 0).map((entry) => entry.task)
    : allTasks;

  const chosenTasks = (matchedTasks.length ? matchedTasks : allTasks).slice(0, limit);
  const taskIds = chosenTasks.map((task) => String(task.id));
  const recentMessagesByTask = new Map<string, RecentTaskSummary["recent_messages"]>();

  if (includeMessages && taskIds.length > 0) {
    const { data: taskMessages, error: messageError } = await supabase
      .from("chat_messages")
      .select("task_id, role, content, created_at, agent_id")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false });

    if (messageError) throw new Error(`Failed to load task messages: ${messageError.message}`);

    for (const message of taskMessages || []) {
      const taskId = message.task_id as string | null;
      if (!taskId) continue;
      const existing = recentMessagesByTask.get(taskId) || [];
      if (existing.length >= 2) continue;
      existing.push({
        role: message.role,
        agent_id: message.agent_id || null,
        content: shortenText(message.content, 220),
        created_at: message.created_at,
      });
      recentMessagesByTask.set(taskId, existing);
    }
  }

  const tasks = chosenTasks.map((task) => {
    const taskId = String(task.id);
    return {
      id: taskId,
      title: typeof task.title === "string" ? task.title : taskId,
      goal: typeof task.goal === "string" ? task.goal : null,
      task_type: typeof task.task_type === "string" ? task.task_type : null,
      status: typeof task.status === "string" ? task.status : "unknown",
      status_summary: summarizeTaskStatus(typeof task.status === "string" ? task.status : "unknown"),
      assigned_agent_id: typeof task.assigned_agent_id === "string" ? task.assigned_agent_id : null,
      created_at: typeof task.created_at === "string" ? task.created_at : new Date().toISOString(),
      updated_at: typeof task.updated_at === "string" ? task.updated_at : new Date().toISOString(),
      result_summary: summarizeTaskResult(task.result),
      recent_messages: recentMessagesByTask.get(taskId),
    } satisfies RecentTaskSummary;
  });

  return {
    query: searchQuery || null,
    matched: searchQuery ? matchedTasks.length > 0 : tasks.length > 0,
    tasks,
  };
}

async function searchChatHistory(
  supabase: any,
  opts?: { query?: unknown; limit?: unknown; conversationId?: string | null },
): Promise<{
  query: string;
  raw_matches: Array<{
    role: string;
    agent_id: string | null;
    created_at: string;
    content: string;
    task_id: string | null;
  }>;
  summary_matches: Array<{
    file_id: string;
    file_path: string;
    updated_at: string;
    excerpt: string;
  }>;
}> {
  const query = typeof opts?.query === "string" ? sanitizeSearchTerm(opts.query) : "";
  const limit = clampInt(opts?.limit, 1, 10, 5);

  if (!query) {
    return { query: "", raw_matches: [], summary_matches: [] };
  }

  let rawQuery = supabase
    .from("chat_messages")
    .select("role, agent_id, created_at, content, task_id")
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts?.conversationId) {
    rawQuery = rawQuery.eq("conversation_id", opts.conversationId);
  }

  const { data: rawMatches, error: rawError } = await rawQuery;

  if (rawError) throw new Error(`Failed to search chat history: ${rawError.message}`);

  const { data: summaryFiles, error: summaryError } = await supabase
    .from("knowledge_files")
    .select("file_id, file_path, content, updated_at")
    .eq("domain", "memory-summaries")
    .eq("is_valid", true)
    .order("updated_at", { ascending: false })
    .limit(120);

  if (summaryError) throw new Error(`Failed to search memory summaries: ${summaryError.message}`);

  const normalizedQuery = query.toLowerCase();
  const summaryMatches = ((summaryFiles || []) as Array<Record<string, unknown>>)
    .filter((file) => typeof file.content === "string" && file.content.toLowerCase().includes(normalizedQuery))
    .slice(0, Math.min(3, limit))
    .map((file) => {
      const content = typeof file.content === "string" ? file.content : "";
      const lower = content.toLowerCase();
      const idx = lower.indexOf(normalizedQuery);
      const excerptStart = idx >= 0 ? Math.max(0, idx - 120) : 0;
      const excerptEnd = idx >= 0 ? Math.min(content.length, idx + normalizedQuery.length + 160) : Math.min(content.length, 280);
      return {
        file_id: String(file.file_id),
        file_path: String(file.file_path),
        updated_at: typeof file.updated_at === "string" ? file.updated_at : new Date().toISOString(),
        excerpt: shortenText(content.slice(excerptStart, excerptEnd), 320),
      };
    });

  return {
    query,
    raw_matches: (rawMatches || []).map((match: any) => ({
      role: match.role,
      agent_id: match.agent_id || null,
      created_at: match.created_at,
      content: shortenText(match.content, 320),
      task_id: match.task_id || null,
    })),
    summary_matches: summaryMatches,
  };
}

function formatRecentTasksForPrompt(tasks: RecentTaskSummary[]): string {
  return tasks
    .map((task, index) => {
      const parts = [
        `${index + 1}. ${task.title}`,
        `status: ${task.status_summary}`,
        task.task_type ? `type: ${task.task_type}` : null,
        task.assigned_agent_id ? `agent: ${task.assigned_agent_id}` : null,
        task.result_summary ? `result: ${task.result_summary}` : null,
        `updated: ${task.updated_at}`,
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .join("\n");
}

// ── Tiered context assembly ───────────────────────────────────────────────────
// Builds a focused context packet per agent:
//   HOT  — last 10 user messages for this agent, plus recent tasks (recency)
//   WARM — top 5 semantically similar memory chunks from last 3 days (relevance)
//   COLD — compact summaries stored in knowledge_files (long-term)
async function buildAgentContext(
  supabase: any,
  agentId: string,
  userQuery: string,
  provider: string,
  apiKey: string,
  opts?: { excludeMessageId?: string | null; conversationId?: string | null },
): Promise<string> {
  const sections: string[] = [];

  const recentUserMessages = await getRecentUserMessages(supabase, {
    limit: 10,
    excludeMessageId: opts?.excludeMessageId,
    conversationId: opts?.conversationId,
  });

  if (recentUserMessages.length) {
    const hotFormatted = recentUserMessages
      .reverse()
      .map((message) => `- ${message.created_at}: ${message.content}`)
      .join("\n");
    sections.push(`## Recent User Messages (last ${recentUserMessages.length})\n${hotFormatted}`);
  }

  if (agentId === "secretary" || agentId === UNIVERSAL_EXECUTOR_AGENT_ID) {
    const recentTasks = await getRecentTasks(supabase, {
      limit: 5,
      query: userQuery,
      includeMessages: false,
      conversationId: opts?.conversationId,
    });
    if (recentTasks.tasks.length) {
      sections.push(`## Recent Tasks\n${formatRecentTasksForPrompt(recentTasks.tasks)}`);
    }
  }

  // User-facing chat currently stores most warm memory under the gateway agent,
  // so non-secretary chat agents search the shared pool instead of a narrow scope.
  const memoryScope = agentId === "secretary" ? "secretary" : "all";

  // WARM: semantic search in recent_memory_chunks (last 72h)
  const embedding = await embedText(userQuery, provider, apiKey);
  if (embedding) {
    const { data: warmChunks } = await supabase.rpc("search_agent_memory", {
      query_embedding: JSON.stringify(embedding),
      p_agent_id: memoryScope,
      match_count: 5,
      hours_back: 72,
    });
    if (warmChunks?.length) {
      const warmFormatted = warmChunks
        .filter((c: any) => c.similarity > 0.6)
        .map((c: any) => `[similarity: ${c.similarity.toFixed(2)}] ${c.content}`)
        .join("\n---\n");
      if (warmFormatted) sections.push(`## Relevant Recent Memory\n${warmFormatted}`);
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : "";
}

// ── Two-stage structured knowledge retrieval ──────────────────────────────────
// Stage 1: Read all README files (tiny index layer, ~500 tokens total)
// Stage 2: Context agent selects relevant file_ids for this query + agent
// Stage 3: Fetch full content of selected files only
async function getStructuredKnowledge(
  supabase: any,
  agentId: string,
  userQuery: string,
  provider: string,
  apiKey: string,
  modelId: string
): Promise<{ content: string; fileCount: number }> {
  // Stage 1: Fetch all README files
  const { data: readmes } = await supabase
    .from("knowledge_files")
    .select("file_id, title, summary, file_path, subdomain")
    .eq("domain", "readme")
    .eq("is_valid", true)
    .order("subdomain");

  if (!readmes?.length) return { content: "", fileCount: 0 };

  // Also get all non-readme knowledge files for the selection pool
  const { data: allFiles } = await supabase
    .from("knowledge_files")
    .select("file_id, title, summary, file_path, domain, confidence_min")
    .eq("is_valid", true)
    .neq("domain", "readme")
    .order("confidence_min", { ascending: false })
    .limit(30);

  if (!allFiles?.length) return { content: "", fileCount: 0 };

  // Format the index for the context agent
  const readmeIndex = readmes
    .map((r: any) => `[FOLDER: ${r.subdomain}] ${r.summary}`)
    .join("\n");

  const fileIndex = allFiles
    .map((f: any) => `[FILE: ${f.file_id}] ${f.file_path} — ${f.summary?.slice(0, 100) || f.title} (confidence: ${f.confidence_min?.toFixed(2) || "?"})`)
    .join("\n");

  // Stage 2: LLM picks relevant files using context agent instructions
  const { data: contextAgent } = await supabase
    .from("agents")
    .select("instructions_md")
    .eq("agent_id", "context-agent")
    .single();

  const selectionPrompt = contextAgent?.instructions_md ||
    "Select relevant knowledge files for the query and agent. Return a JSON array of file_ids. 2-4 max.";

  // Default fallback by agent type (used if LLM selection fails)
  const defaultFiles: Record<string, string[]> = {
    secretary: ["knowledge-personal-profile", "knowledge-personal-preferences"],
    "universal-executor": ["knowledge-personal-profile", "knowledge-personal-preferences", "knowledge-dev-projects"],
    "website-brief-normalizer": ["knowledge-personal-profile", "knowledge-personal-preferences", "knowledge-dev-projects"],
    "website-html-builder": ["knowledge-personal-profile", "knowledge-personal-preferences", "knowledge-dev-projects"],
    "presentation-outline-planner": ["knowledge-personal-profile", "knowledge-dev-projects"],
    "presentation-slide-builder": ["knowledge-personal-profile", "knowledge-dev-projects"],
  };

  let selectedIds: string[] = [];
  try {
    const selectionResult = await callLLM(provider, modelId, apiKey, [
      { role: "system", content: selectionPrompt },
      {
        role: "user",
        content: `Query: "${userQuery}"\nTarget agent: ${agentId}\n\nFolder index:\n${readmeIndex}\n\nAvailable files:\n${fileIndex}`,
      },
    ]);
    const parsed = parseJsonResponse<string[]>(selectionResult);
    selectedIds = Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    selectedIds = defaultFiles[agentId] || ["knowledge-personal-profile"];
  }

  if (!selectedIds.length) return { content: "", fileCount: 0 };

  // Stage 3: Fetch full content of selected files
  const { data: selectedFiles } = await supabase
    .from("knowledge_files")
    .select("title, content, file_path")
    .in("file_id", selectedIds)
    .eq("is_valid", true);

  if (!selectedFiles?.length) return { content: "", fileCount: 0 };

  return {
    content: `## Structured Knowledge\n\n` +
      selectedFiles
      .map((f: any) => `### ${f.title}\n${f.content}`)
      .join("\n\n"),
    fileCount: selectedFiles.length,
  };
}

function sanitizeAgentContent(content: string): string {
  return content
    .replace(/(?:^|\r?\n)\s*📞?\s*tools\.[^\n]*/g, "")
    .replace(/(?:^|\r?\n)\s*\{"tool_calls":[\s\S]*$/g, "")
    .replace(/(?:^|\r?\n)\s*\{"tool_call":[\s\S]*$/g, "")
    .trimEnd();
}

async function runWebSearch(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("web_search requires a non-empty query.");
  }

  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`, {
    headers: {
      "User-Agent": "AI Mission Control/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Web search failed with HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: Array<{ title: string; url: string }> = [];
  const linkRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkRegex)) {
    const url = unwrapDuckDuckGoUrl(match[1]);
    const title = stripHtml(match[2]);
    if (!url || !title) continue;
    results.push({ title, url });
    if (results.length >= 5) break;
  }

  return {
    query: normalizedQuery,
    results,
  };
}

async function executeToolCall(
  toolCall: ToolCallRequest,
  ctx: ToolExecutionContext,
): Promise<{ name: string; result: unknown }> {
  if (ctx.allowedToolNames && !ctx.allowedToolNames.has(toolCall.name)) {
    return {
      name: toolCall.name,
      result: {
        error: `Tool "${toolCall.name}" is not allowed for agent "${ctx.agentId || "unknown"}".`,
      },
    };
  }

  const args = toolCall.args || {};

  switch (toolCall.name) {
    case "web_search":
      return {
        name: toolCall.name,
        result: await runWebSearch(typeof args.query === "string" ? args.query : ""),
      };
    case "read_memory_file": {
      const fileId = typeof args.file_id === "string" ? args.file_id.trim() : "";
      const { data, error } = await ctx.supabase
        .from("knowledge_files")
        .select("file_id, file_path, title, content, updated_at")
        .eq("file_id", fileId)
        .eq("is_valid", true)
        .maybeSingle();
      if (error) throw new Error(`Failed to read memory file: ${error.message}`);
      return {
        name: toolCall.name,
        result: data || { error: `Knowledge file "${fileId}" not found.` },
      };
    }
    case "list_user_context": {
      const folder = typeof args.folder === "string" ? args.folder.trim().toLowerCase().replace(/^knowledge\//, "") : "";
      const { data, error } = await ctx.supabase
        .from("knowledge_files")
        .select("file_id, title, summary, file_path, domain, subdomain")
        .eq("is_valid", true)
        .neq("domain", "readme")
        .order("file_path", { ascending: true })
        .limit(100);
      if (error) throw new Error(`Failed to list user context: ${error.message}`);

      const files = ((data || []) as Array<Record<string, unknown>>)
        .filter((file) => {
          if (!folder) return true;
          const path = typeof file.file_path === "string" ? file.file_path.toLowerCase() : "";
          const domain = typeof file.domain === "string" ? file.domain.toLowerCase() : "";
          const subdomain = typeof file.subdomain === "string" ? file.subdomain.toLowerCase() : "";
          return path.startsWith(`${folder}/`) || path.includes(`/${folder}/`) || domain === folder || subdomain === folder;
        })
        .slice(0, 25)
        .map((file) => ({
          file_id: file.file_id,
          title: file.title,
          summary: file.summary,
          file_path: file.file_path,
        }));

      return {
        name: toolCall.name,
        result: {
          folder: folder || null,
          files,
        },
      };
    }
    case "get_recent_user_messages":
      return {
        name: toolCall.name,
        result: {
          messages: await getRecentUserMessages(ctx.supabase, {
            limit: args.limit,
            excludeMessageId: args.include_current === true ? null : ctx.currentUserMessageId,
            conversationId: ctx.conversationId,
          }),
        },
      };
    case "get_recent_tasks":
      return {
        name: toolCall.name,
        result: await getRecentTasks(ctx.supabase, {
          limit: args.limit,
          query: args.query,
          includeMessages: args.include_messages,
          conversationId: ctx.conversationId,
        }),
      };
    case "search_chat_history":
      return {
        name: toolCall.name,
        result: await searchChatHistory(ctx.supabase, {
          query: args.query,
          limit: args.limit,
          conversationId: ctx.conversationId,
        }),
      };
    case "write_code":
      return {
        name: toolCall.name,
        result: {
          error: "write_code is not available in the current Supabase runtime. Add a local execution bridge before assigning this tool.",
        },
      };
    case "run_terminal":
      return {
        name: toolCall.name,
        result: {
          error: "run_terminal is not available in the current Supabase runtime. Add a local execution bridge before assigning this tool.",
        },
      };
    default:
      return {
        name: toolCall.name,
        result: { error: `Unsupported tool "${toolCall.name}".` },
      };
  }
}

async function runAgentWithTools(
  provider: string,
  model: string,
  apiKey: string,
  initialMessages: any[],
  tools: any[],
  toolContext: ToolExecutionContext,
): Promise<string> {
  if (!tools.length) {
    return await callLLM(provider, model, apiKey, initialMessages);
  }

  const workingMessages = [...initialMessages];

  for (let step = 0; step < 4; step += 1) {
    const rawResponse = await callLLM(provider, model, apiKey, workingMessages, { tools });
    const parsed = parseJsonResponse<{ tool_calls?: ToolCallRequest[] }>(rawResponse);
    const toolCalls = Array.isArray(parsed?.tool_calls) ? parsed.tool_calls : [];

    if (!toolCalls.length) {
      return rawResponse;
    }

    const toolResults = [];
    for (const toolCall of toolCalls) {
      try {
        const executed = await executeToolCall(toolCall, toolContext);
        toolResults.push({
          name: executed.name,
          args: toolCall.args || {},
          result: executed.result,
        });
      } catch (error) {
        toolResults.push({
          name: toolCall.name,
          args: toolCall.args || {},
          result: {
            error: error instanceof Error ? error.message : "Tool execution failed.",
          },
        });
      }
    }

    workingMessages.push(
      { role: "assistant", content: JSON.stringify({ tool_calls: toolCalls }) },
      {
        role: "user",
        content: [
          "Tool results are available below.",
          "Use them to answer the user's request.",
          "Do not mention internal tools, tool calls, or JSON.",
          JSON.stringify(toolResults, null, 2),
        ].join("\n\n"),
      },
    );
  }

  throw new Error("Agent exceeded the maximum number of tool rounds.");
}

function metaEvent(data: Record<string, any>): string {
  return `data: ${JSON.stringify({ type: "meta", ...data })}\n\n`;
}

function textChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

async function writeSpecialistRunSummary(args: {
  taskId: string;
  goal: string;
  category: string;
  channel: string;
  status: string;
  agentId: string;
  agentName: string;
  artifacts?: string[];
  factsLearned?: string[];
  blockers?: string[];
  result: string;
}) {
  const createdAt = new Date().toISOString();
  return await writeRunSummaryFile({
    createdAt,
    agentId: args.agentId,
    taskDomain: args.category || "specialist-task",
    channel: args.channel,
    status: args.status,
    frontmatter: {
      run_id: args.taskId,
      task_id: args.taskId,
      goal_id: args.taskId,
      created_at: createdAt,
      agent_id: args.agentId,
      agent_name: args.agentName,
      task_domain: args.category,
      channel: args.channel,
      status: args.status,
    },
    sections: [
      { heading: "Objective", body: args.goal },
      { heading: "Result", body: args.result },
      {
        heading: "Facts Learned",
        body: args.factsLearned?.length ? args.factsLearned.map((item) => `- ${item}`).join("\n") : "- No durable facts captured.",
      },
      {
        heading: "Blockers",
        body: args.blockers?.length ? args.blockers.map((item) => `- ${item}`).join("\n") : "- None.",
      },
      {
        heading: "Artifacts",
        body: args.artifacts?.length ? args.artifacts.map((item) => `- ${item}`).join("\n") : "- None.",
      },
    ],
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await requireUser(req);
    const {
      messages,
      conversation_id: requestedConversationId,
    } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await ensureUniversalExecutorSeed(supabase);
    const conversation = await resolveConversation(supabase, userId, requestedConversationId);

    const userMessage = messages[messages.length - 1]?.content || "";
    const nowIso = new Date().toISOString();
    const { data: currentUserChatMessage, error: userMessageInsertError } = await supabase
      .from("chat_messages")
      .insert({
        role: "user",
        content: userMessage,
        agent_id: "secretary",
        owner_user_id: userId,
        conversation_id: conversation.id,
      })
      .select("id")
      .single();

    if (userMessageInsertError) {
      throw new Error(`Failed to store user message: ${userMessageInsertError.message}`);
    }
    await touchConversation(supabase, conversation.id, nowIso);

    // ── Classify intent ──
    let orchestratorInfo;
    try { orchestratorInfo = await resolveAgent(supabase, "orchestrator", userId); }
    catch { try { orchestratorInfo = await resolveAgent(supabase, "secretary", userId); } catch (e2: any) {
      return new Response(JSON.stringify({ error: e2.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }}

    if (!orchestratorInfo.agent?.instructions_md) {
      throw new Error("Orchestrator agent has no instructions_md defined in the database.");
    }
    const orchestratorPrompt = orchestratorInfo.agent.instructions_md;
    const classificationResult = await callLLM(
      orchestratorInfo.provider,
      orchestratorInfo.modelId,
      orchestratorInfo.apiKey,
      [
        {
          role: "system",
          content:
            orchestratorPrompt +
            '\n\nAdditional category: "cron" — use when the user wants to schedule, repeat, or automate something on a timer (for example: "every morning", "every hour", "run X every 30 minutes").',
        },
        { role: "user", content: userMessage },
      ],
    );

    let category = "chat";
    let cronData: CronSpec = {};
    const parsedClassification = parseJsonResponse<{ category?: string }>(classificationResult);
    if (parsedClassification) {
      category = parsedClassification.category || "chat";
    } else {
      if (classificationResult.toLowerCase().includes("presentation")) category = "presentation";
      else if (classificationResult.toLowerCase().includes("website")) category = "website";
      else if (classificationResult.toLowerCase().includes("cron")) category = "cron";
    }

    if (category === "cron") {
      try {
        const cronExtractorInfo = await resolveAgent(supabase, "cron-spec-extractor", userId);
        if (!cronExtractorInfo.agent?.instructions_md) {
          throw new Error("Cron Spec Extractor agent has no instructions_md defined in the database.");
        }

        const cronResult = await callLLM(
          cronExtractorInfo.provider,
          cronExtractorInfo.modelId,
          cronExtractorInfo.apiKey,
          [
            { role: "system", content: cronExtractorInfo.agent.instructions_md },
            { role: "user", content: userMessage },
          ],
          { tools: cronExtractorInfo.tools },
        );

        cronData = parseJsonResponse<CronSpec>(cronResult) || {
          needs_clarification: true,
          question: "What schedule should I use for this recurring task?",
        };
      } catch {
        cronData = {
          needs_clarification: true,
          question: "What schedule should I use for this recurring task?",
        };
      }
    }

    // ── Handle cron job creation ──
    if (category === "cron" && !cronData.needs_clarification && cronData.schedule && cronData.prompt) {
      await supabase.from("cron_jobs").insert({
        name: cronData.name || userMessage.slice(0, 50),
        owner_user_id: userId,
        schedule: cronData.schedule,
        function_name: "cron-execute",
        is_active: true,
        starts_at: nowIso,
        timezone: "local",
        recurrence_rule: cronData.schedule,
        config: { prompt: cronData.prompt },
      });
    }

    const specialistFlow =
      category === "website" || category === "presentation"
        ? SPECIALIST_FLOWS[category as SpecialistCategory]
        : null;

    // ── Create task record for specialist work ──
    const specialistId = specialistFlow?.builderAgentId || "secretary";
    let taskRecord: any = null;
    if (specialistFlow) {
      const { data: task } = await supabase.from("tasks").insert({
        title: userMessage.slice(0, 100),
        goal: userMessage,
        task_type: category,
        status: "received",
        assigned_agent_id: specialistId,
        owner_user_id: userId,
        conversation_id: conversation.id,
      }).select().single();
      taskRecord = task;
    }

    let responseAgentId = "secretary";
    if (category === "chat") {
      try {
        responseAgentId = await selectBestChatAgent(supabase, userMessage, orchestratorInfo);
      } catch {
        responseAgentId = UNIVERSAL_EXECUTOR_AGENT_ID;
      }
    }

    // ── Resolve the conversational agent for the streaming response ──
    let responseAgentInfo: Awaited<ReturnType<typeof resolveAgent>> | null = null;
    let responseAgentError: Error | null = null;
    const responseAgentCandidates = Array.from(
      new Set([
        responseAgentId,
        ...(category === "chat" && responseAgentId !== UNIVERSAL_EXECUTOR_AGENT_ID ? [UNIVERSAL_EXECUTOR_AGENT_ID] : []),
        ...(responseAgentId !== "secretary" ? ["secretary"] : []),
      ]),
    );

    for (const candidateId of responseAgentCandidates) {
      try {
        responseAgentInfo = await resolveAgent(supabase, candidateId, userId);
        responseAgentId = candidateId;
        responseAgentError = null;
        break;
      } catch (error) {
        responseAgentError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (!responseAgentInfo) {
      const message = responseAgentError?.message || "Failed to resolve a conversational agent.";
      return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Embed user message into warm memory (fire-and-forget) ──
    // Stores the embedding in recent_memory_chunks so future requests can
    // retrieve relevant context via semantic similarity search.
    embedText(userMessage, responseAgentInfo.provider, responseAgentInfo.apiKey).then(async (embedding) => {
      if (embedding) {
        await supabase.from("recent_memory_chunks").insert({
          content: userMessage,
          source_type: "chat",
          source_id: responseAgentId,
          metadata: { agent_id: responseAgentId, role: "user" },
          embedding: JSON.stringify(embedding),
        });
      }
    }).catch(() => { /* non-blocking — don't fail the chat request if embedding fails */ });

    // ── Build tiered context for the active conversational agent ──
    const agentContext = await buildAgentContext(
      supabase, responseAgentId, userMessage,
      responseAgentInfo.provider, responseAgentInfo.apiKey,
      {
        excludeMessageId: currentUserChatMessage?.id || null,
        conversationId: conversation.id,
      },
    );

    // ── Two-stage structured knowledge retrieval ──
    // Context agent reads README indexes → picks relevant files → full content injected.
    const { content: structuredKnowledge } = await getStructuredKnowledge(
      supabase, responseAgentId, userMessage,
      responseAgentInfo.provider, responseAgentInfo.apiKey, responseAgentInfo.modelId
    );

    const contextBlock = [agentContext, structuredKnowledge].filter(Boolean).join("\n\n");
    if (!responseAgentInfo.agent?.instructions_md) {
      throw new Error(`Agent "${responseAgentId}" has no instructions_md defined in the database.`);
    }
    const responseAgentSystem = responseAgentInfo.agent.instructions_md + (contextBlock ? `\n\n---\n${contextBlock}` : "");
    const contextMeta = buildContextEstimateMeta({
      prompt: responseAgentInfo.agent.instructions_md,
      contextBlock,
      modelId: responseAgentInfo.modelId,
      modelMeta: responseAgentInfo.modelMeta,
    });

    // For specialist tasks, tell the gateway agent to acknowledge and delegate.
    // We send ONLY the current user message — not the whole history —
    // because the tiered context in the system prompt already provides memory.
    let responseAgentMessages: any[];
    if (category === "cron") {
      const cronHint = cronData.needs_clarification
        ? `\n\nIMPORTANT: The user wants to schedule a recurring task, but the schedule is still ambiguous. Ask exactly this follow-up question in your own natural wording: "${cronData.question || "What schedule should I use for this recurring task?"}". Be brief and conversational.`
        : `\n\nIMPORTANT: The user just scheduled a cron job. Confirm what was scheduled: name="${cronData.name}", schedule="${cronData.schedule}", prompt="${cronData.prompt}". Tell them they can manage it on the Cron Jobs page. Be brief and conversational.`;
      responseAgentMessages = [
        { role: "system", content: responseAgentSystem + cronHint },
        { role: "user", content: userMessage },
      ];
    } else if (specialistFlow) {
      const delegationHint = `\n\nIMPORTANT: The user just asked for a ${category}. Tell them you are delegating this to the ${category} specialist and they can keep chatting. Be brief and conversational. Do NOT try to create the ${category} yourself. Do not mention tools, function calls, JSON, or any internal syntax.`;
      responseAgentMessages = [
        { role: "system", content: responseAgentSystem + delegationHint },
        { role: "user", content: userMessage },
      ];
    } else {
      responseAgentMessages = [
        { role: "system", content: responseAgentSystem },
        { role: "user", content: userMessage },
      ];
    }

    // ── Build SSE stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(metaEvent({
            conversationId: conversation.id,
            conversationKind: conversation.kind,
            agent: responseAgentId,
            agentName: responseAgentInfo.agent.name,
            model: responseAgentInfo.modelId,
            contextWindowTokens: contextMeta.contextWindowTokens,
            estimatedUsedTokens: contextMeta.estimatedUsedTokens,
            defaultOutputTokens: contextMeta.defaultOutputTokens,
          })));

          // If specialist task, emit initial "classifying" meta right away
          if (specialistFlow && taskRecord) {
            controller.enqueue(encoder.encode(metaEvent({
              taskId: taskRecord.id, category, status: "classifying",
              agentName: "orchestrator",
              model: orchestratorInfo.modelId,
              actions: [
                { agent: "orchestrator", title: "Classifying request", status: "done" },
              ],
            })));
          }

          const responseAgentResult = await runAgentWithTools(
            responseAgentInfo.provider,
            responseAgentInfo.modelId,
            responseAgentInfo.apiKey,
            responseAgentMessages,
            responseAgentInfo.tools,
            {
              supabase,
              currentUserMessageId: currentUserChatMessage?.id || null,
              conversationId: conversation.id,
              allowedToolNames: new Set(responseAgentInfo.allowedToolNames || []),
              agentId: responseAgentId,
            },
          );

          const responseContent = sanitizeAgentContent(responseAgentResult);
          if (responseContent) {
            controller.enqueue(encoder.encode(textChunk(responseContent)));
          }

          // Save the conversational agent response
          if (responseContent) {
            await supabase.from("chat_messages").insert({
              role: "assistant", content: responseContent, agent_id: responseAgentId,
              task_id: taskRecord?.id || null,
              owner_user_id: userId,
              conversation_id: conversation.id,
            });
            await touchConversation(supabase, conversation.id, new Date().toISOString());
          }

          // Phase 2: If specialist task, run it and emit granular meta events
          if (specialistFlow && taskRecord) {
            try {
              const plannerInfo = await resolveAgent(supabase, specialistFlow.plannerAgentId, userId);
              const builderInfo = await resolveAgent(supabase, specialistFlow.builderAgentId, userId);
              const qaInfo = await resolveAgent(supabase, "artifact-qa-reviewer", userId);

              if (!plannerInfo.agent?.instructions_md) {
                throw new Error(`Planner agent "${specialistFlow.plannerAgentId}" has no instructions_md defined.`);
              }
              if (!builderInfo.agent?.instructions_md) {
                throw new Error(`Builder agent "${specialistFlow.builderAgentId}" has no instructions_md defined.`);
              }
              if (!qaInfo.agent?.instructions_md) {
                throw new Error('QA agent "artifact-qa-reviewer" has no instructions_md defined.');
              }

              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id,
                category,
                status: "agent_selected",
                agentName: plannerInfo.agent.name,
                model: plannerInfo.modelId,
                actions: [
                  doneAction("orchestrator", "Classifying request"),
                  doneAction("orchestrator", "Selecting specialist flow"),
                  runningAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                ],
              })));

              await supabase.from("tasks").update({ status: "classified" }).eq("id", taskRecord.id);

              const injectStructuredKnowledge = shouldLoadStructuredKnowledge(category, userMessage);
              let structuredKnowledge = "";
              let structuredKnowledgeFileCount = 0;

              if (injectStructuredKnowledge) {
                controller.enqueue(encoder.encode(metaEvent({
                  taskId: taskRecord.id,
                  status: "loading_context",
                  agentName: "context-agent",
                  actions: [
                    doneAction("orchestrator", "Classifying request"),
                    doneAction("orchestrator", "Selecting specialist flow"),
                    runningAction("context-agent", "Loading knowledge"),
                    runningAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                  ],
                })));

                const specialistKnowledge = await getStructuredKnowledge(
                  supabase,
                  specialistFlow.plannerAgentId,
                  userMessage,
                  plannerInfo.provider,
                  plannerInfo.apiKey,
                  plannerInfo.modelId,
                );

                structuredKnowledge = specialistKnowledge.content;
                structuredKnowledgeFileCount = specialistKnowledge.fileCount;

                await supabase.from("tasks").update({
                  status: "long_term_context_ready",
                  context_packet: {
                    structured_knowledge_files: specialistKnowledge.fileCount,
                    structured_knowledge_loaded: specialistKnowledge.fileCount > 0,
                  },
                }).eq("id", taskRecord.id);

                controller.enqueue(encoder.encode(metaEvent({
                  taskId: taskRecord.id,
                  status: "context_loaded",
                  agentName: plannerInfo.agent.name,
                  model: plannerInfo.modelId,
                  actions: [
                    doneAction("orchestrator", "Classifying request"),
                    doneAction("orchestrator", "Selecting specialist flow"),
                    doneAction("context-agent", "Loading knowledge", `${specialistKnowledge.fileCount} file(s)`),
                    runningAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                  ],
                })));
              }

              const plannerSystem = structuredKnowledge
                ? `${plannerInfo.agent.instructions_md}\n\n---\n${structuredKnowledge}`
                : plannerInfo.agent.instructions_md;

              const plannerRaw = await callLLM(
                plannerInfo.provider,
                plannerInfo.modelId,
                plannerInfo.apiKey,
                [
                  { role: "system", content: plannerSystem },
                  { role: "user", content: userMessage },
                ],
                { tools: plannerInfo.tools },
              );

              const structuredPlan = parseJsonResponse<Record<string, unknown>>(plannerRaw);
              if (!structuredPlan) {
                throw new Error(`Planner agent "${specialistFlow.plannerAgentId}" returned invalid JSON.`);
              }

              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id,
                status: "specialist_running",
                agentName: builderInfo.agent.name,
                model: builderInfo.modelId,
                actions: [
                  doneAction("orchestrator", "Classifying request"),
                  doneAction("orchestrator", "Selecting specialist flow"),
                  ...(injectStructuredKnowledge ? [doneAction("context-agent", "Loading knowledge", `${structuredKnowledgeFileCount} file(s)`)] : []),
                  doneAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                  runningAction(specialistFlow.builderAgentId, specialistFlow.builderTitle),
                ],
              })));

              await supabase.from("tasks").update({
                status: "specialist_running",
                context_packet: {
                  planner_agent_id: specialistFlow.plannerAgentId,
                  builder_agent_id: specialistFlow.builderAgentId,
                  structured_knowledge_files: structuredKnowledgeFileCount,
                  plan: structuredPlan,
                },
              }).eq("id", taskRecord.id);

              const builderSystem = structuredKnowledge
                ? `${builderInfo.agent.instructions_md}\n\n---\n${structuredKnowledge}`
                : builderInfo.agent.instructions_md;

              const builderRequest = [
                `Original request:\n${userMessage}`,
                `Approved ${specialistFlow.plannerOutputLabel} JSON:\n${JSON.stringify(structuredPlan, null, 2)}`,
              ].join("\n\n");

              let cleanHtml = cleanHtmlArtifact(
                await callLLM(
                  builderInfo.provider,
                  builderInfo.modelId,
                  builderInfo.apiKey,
                  [
                    { role: "system", content: builderSystem },
                    { role: "user", content: builderRequest },
                  ],
                  { tools: builderInfo.tools },
                ),
              );

              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id,
                status: "reviewing_artifact",
                agentName: qaInfo.agent.name,
                model: qaInfo.modelId,
                actions: [
                  doneAction("orchestrator", "Classifying request"),
                  doneAction("orchestrator", "Selecting specialist flow"),
                  ...(injectStructuredKnowledge ? [doneAction("context-agent", "Loading knowledge", `${structuredKnowledgeFileCount} file(s)`)] : []),
                  doneAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                  doneAction(specialistFlow.builderAgentId, specialistFlow.builderTitle),
                  runningAction("artifact-qa-reviewer", "Reviewing artifact"),
                ],
              })));

              const reviewRequest = [
                `Artifact type: ${specialistFlow.artifactType}`,
                `Original request:\n${userMessage}`,
                `Approved ${specialistFlow.plannerOutputLabel} JSON:\n${JSON.stringify(structuredPlan, null, 2)}`,
                `HTML artifact:\n${cleanHtml}`,
              ].join("\n\n");

              let review = normalizeReview(
                parseJsonResponse<QaReview>(
                  await callLLM(
                    qaInfo.provider,
                    qaInfo.modelId,
                    qaInfo.apiKey,
                    [
                      { role: "system", content: qaInfo.agent.instructions_md },
                      { role: "user", content: reviewRequest },
                    ],
                    { tools: qaInfo.tools },
                  ),
                ),
              );

              let qaOutput = summarizeReview(review);
              if (hasBlockingDefects(review)) {
                controller.enqueue(encoder.encode(metaEvent({
                  taskId: taskRecord.id,
                  status: "repairing_artifact",
                  agentName: builderInfo.agent.name,
                  model: builderInfo.modelId,
                  actions: [
                    doneAction("orchestrator", "Classifying request"),
                    doneAction("orchestrator", "Selecting specialist flow"),
                    ...(injectStructuredKnowledge ? [doneAction("context-agent", "Loading knowledge", `${structuredKnowledgeFileCount} file(s)`)] : []),
                    doneAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                    doneAction(specialistFlow.builderAgentId, specialistFlow.builderTitle),
                    doneAction("artifact-qa-reviewer", "Reviewing artifact", qaOutput),
                    runningAction(specialistFlow.builderAgentId, "Repairing artifact"),
                  ],
                })));

                const repairRequest = [
                  `Original request:\n${userMessage}`,
                  `Approved ${specialistFlow.plannerOutputLabel} JSON:\n${JSON.stringify(structuredPlan, null, 2)}`,
                  `Current HTML artifact:\n${cleanHtml}`,
                  `Defects to fix:\n${formatDefectList(review.defects.filter((defect) => defect.severity !== "low"))}`,
                  "Return only the full corrected HTML document.",
                ].join("\n\n");

                cleanHtml = cleanHtmlArtifact(
                  await callLLM(
                    builderInfo.provider,
                    builderInfo.modelId,
                    builderInfo.apiKey,
                    [
                      { role: "system", content: builderSystem },
                      { role: "user", content: repairRequest },
                    ],
                    { tools: builderInfo.tools },
                  ),
                );

                review = normalizeReview(
                  parseJsonResponse<QaReview>(
                    await callLLM(
                      qaInfo.provider,
                      qaInfo.modelId,
                      qaInfo.apiKey,
                      [
                        { role: "system", content: qaInfo.agent.instructions_md },
                        {
                          role: "user",
                          content: [
                            `Artifact type: ${specialistFlow.artifactType}`,
                            `Original request:\n${userMessage}`,
                            `Approved ${specialistFlow.plannerOutputLabel} JSON:\n${JSON.stringify(structuredPlan, null, 2)}`,
                            `HTML artifact:\n${cleanHtml}`,
                          ].join("\n\n"),
                        },
                      ],
                      { tools: qaInfo.tools },
                    ),
                  ),
                );
                qaOutput = `Repair pass complete; ${summarizeReview(review)}`;
              }

              if (review.pass) {
                await supabase.from("tasks").update({ status: "specialist_self_check_passed" }).eq("id", taskRecord.id);
              }

              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id,
                status: "finalizing",
                actions: [
                  doneAction("orchestrator", "Classifying request"),
                  doneAction("orchestrator", "Selecting specialist flow"),
                  ...(injectStructuredKnowledge ? [doneAction("context-agent", "Loading knowledge", `${structuredKnowledgeFileCount} file(s)`)] : []),
                  doneAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                  doneAction(specialistFlow.builderAgentId, specialistFlow.builderTitle),
                  doneAction("artifact-qa-reviewer", "Reviewing artifact", qaOutput),
                  runningAction("client", specialistFlow.artifactType === "website" ? "Saving website file" : "Preparing local file"),
                ],
              })));

              const websiteFile = specialistFlow.artifactType === "website"
                ? await saveWebsiteToDocuments(
                    cleanHtml,
                    structuredPlan,
                    userMessage,
                    taskRecord.id,
                    supabaseUrl,
                  )
                : null;

              const artifact: ArtifactPayload = {
                id: taskRecord.id,
                type: specialistFlow.artifactType,
                label: specialistFlow.artifactLabel,
                html: cleanHtml,
                createdAt: new Date().toISOString(),
                url: websiteFile?.openUrl,
                filePath: websiteFile?.filePath,
                fileName: websiteFile?.fileName,
              };

              await supabase.from("tasks").update({
                status: "reported_to_secretary",
                result: {
                  local_artifact_id: artifact.id,
                  type: artifact.type,
                  label: artifact.label,
                  plan: structuredPlan,
                  qa_review: review,
                  open_url: artifact.url || null,
                  saved_file_path: artifact.filePath || null,
                  saved_file_name: artifact.fileName || null,
                },
              }).eq("id", taskRecord.id);

              await writeSpecialistRunSummary({
                taskId: taskRecord.id,
                goal: userMessage,
                category,
                channel: conversation.kind,
                status: "done",
                agentId: specialistFlow.builderAgentId,
                agentName: builderInfo.agent.name,
                artifacts: [artifact.filePath || artifact.url || artifact.fileName || artifact.label].filter(Boolean),
                factsLearned: [
                  `${specialistFlow.plannerOutputLabel} produced for ${category}.`,
                  qaOutput,
                  injectStructuredKnowledge
                    ? `Loaded ${structuredKnowledgeFileCount} structured knowledge file(s).`
                    : "No structured knowledge loaded.",
                ],
                blockers: review.pass ? [] : review.defects.map((defect) => `${defect.title}: ${defect.description}`),
                result: review.pass
                  ? `${specialistFlow.artifactLabel} completed successfully.`
                  : `${specialistFlow.artifactLabel} completed with QA warnings.`,
              });

              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id,
                status: "done",
                url: artifact.url,
                artifact,
                actions: [
                  doneAction("orchestrator", "Classifying request"),
                  doneAction("orchestrator", "Selecting specialist flow"),
                  ...(injectStructuredKnowledge ? [doneAction("context-agent", "Loading knowledge", `${structuredKnowledgeFileCount} file(s)`)] : []),
                  doneAction(specialistFlow.plannerAgentId, specialistFlow.plannerTitle),
                  doneAction(specialistFlow.builderAgentId, specialistFlow.builderTitle),
                  doneAction("artifact-qa-reviewer", "Reviewing artifact", qaOutput),
                  doneAction(
                    "client",
                    specialistFlow.artifactType === "website" ? "Saving website file" : "Preparing local file",
                    specialistFlow.artifactType === "website"
                      ? `Saved to ${artifact.fileName}`
                      : "Stored locally in the browser",
                  ),
                ],
              })));
            } catch (err: any) {
              await writeSpecialistRunSummary({
                taskId: taskRecord.id,
                goal: userMessage,
                category,
                channel: conversation.kind,
                status: "failed",
                agentId: specialistFlow.builderAgentId,
                agentName: specialistFlow.builderAgentId,
                factsLearned: [],
                blockers: [err.message],
                result: `Specialist task failed: ${err.message}`,
              }).catch(() => null);
              controller.enqueue(encoder.encode(metaEvent({
                taskId: taskRecord.id,
                status: "failed",
                error: err.message,
                actions: [
                  doneAction("orchestrator", "Classifying request"),
                  failedAction(specialistFlow.builderAgentId, specialistFlow.builderTitle, err.message),
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
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message === "Authentication required." ? 401 : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
