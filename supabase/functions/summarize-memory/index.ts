import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecretIfNeeded } from "../_shared/credential-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function getOpenRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
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

const MAX_LINES = 300;

// ── Category → knowledge file mapping ────────────────────────────────────────
const CATEGORY_FILES: Record<string, { fileId: string; filePath: string; domain: string; title: string }> = {
  personal:                 { fileId: "knowledge-personal-profile",    filePath: "knowledge/personal/profile.md",          domain: "personal",     title: "Personal Profile" },
  preferences:              { fileId: "knowledge-personal-preferences", filePath: "knowledge/personal/preferences.md",      domain: "personal",     title: "Preferences" },
  development_instructions: { fileId: "knowledge-dev-instructions",    filePath: "knowledge/development/instructions.md",  domain: "development",  title: "Development Instructions" },
  projects:                 { fileId: "knowledge-dev-projects",        filePath: "knowledge/development/projects.md",      domain: "development",  title: "Active Projects" },
  tools:                    { fileId: "knowledge-dev-tools",           filePath: "knowledge/development/tools.md",         domain: "development",  title: "Tools & Libraries" },
};

// ── LLM helper ───────────────────────────────────────────────────────────────
async function callLLM(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  maxTokens = 4096
): Promise<string> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userContent },
  ];

  if (provider === "google" || provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (provider === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, system: systemPrompt, messages: [{ role: "user", content: userContent }], max_tokens: maxTokens }),
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.content?.[0]?.text || "";
  }

  // OpenAI-compatible
  const urls: Record<string, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    openrouter: `${OPENROUTER_BASE_URL}/chat/completions`,
    groq: "https://api.groq.com/openai/v1/chat/completions",
    deepseek: "https://api.deepseek.com/v1/chat/completions",
    together: "https://api.together.xyz/v1/chat/completions",
    fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
    mistral: "https://api.mistral.ai/v1/chat/completions",
    perplexity: "https://api.perplexity.ai/chat/completions",
  };
  const resp = await fetch(urls[provider] || urls.openai, {
    method: "POST",
    headers: provider === "openrouter"
      ? getOpenRouterHeaders(apiKey)
      : { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Strip code fences from LLM responses ─────────────────────────────────────
function stripFences(raw: string): string {
  return raw.trim().replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
}

function getLinkedCredentialId(modelReg: { config?: Record<string, unknown> | null } | null | undefined): string | null {
  const config = modelReg?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const credentialId = (config as Record<string, unknown>).credential_id;
  return typeof credentialId === "string" && credentialId.length > 0 ? credentialId : null;
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

  if (!credMeta) {
    throw new Error(`No API credentials configured for provider "${provider}".`);
  }

  const { data: credVals } = await supabase
    .from("credential_values")
    .select("encrypted_value, owner_user_id")
    .eq("credential_meta_id", credMeta.id);

  const credVal = pickOwnedRow(credVals || [], ownerUserId);

  if (!credVal?.encrypted_value) {
    throw new Error(`API key for "${provider}" not set.`);
  }

  return decryptSecretIfNeeded(credVal.encrypted_value);
}

async function resolveAgentExecution(
  supabase: any,
  agentId: string,
  ownerUserId?: string | null,
): Promise<{ prompt: string; provider: string; model: string; apiKey: string }> {
  const { data: agent } = await supabase
    .from("agents")
    .select("model, instructions_md")
    .eq("agent_id", agentId)
    .single();

  if (!agent?.model) {
    throw new Error(`Agent "${agentId}" has no model configured.`);
  }

  const modelReg = await resolveModelRegistration(supabase, agent.model, ownerUserId);
  const provider = modelReg?.provider?.toLowerCase() || "openai";
  const apiKey = await resolveProviderCredential(
    supabase,
    provider,
    getLinkedCredentialId(modelReg),
    ownerUserId,
  );

  return {
    prompt: agent.instructions_md || "",
    provider,
    model: agent.model,
    apiKey,
  };
}

// ── Step 1: Extract structured facts ─────────────────────────────────────────
async function extractFacts(
  conversation: string,
  curatorPrompt: string,
  provider: string,
  model: string,
  apiKey: string
): Promise<Record<string, Array<{ key: string; value: string; confidence: number; target_file?: string }>>> {
  const userContent = `TASK: EXTRACT_FACTS\n\nConversation to analyze:\n\n${conversation}\n\nReturn only the JSON object as specified in your instructions.`;
  const raw = await callLLM(provider, model, apiKey, curatorPrompt, userContent, 2048);
  try {
    return JSON.parse(stripFences(raw));
  } catch {
    console.warn("Extraction parse failed:", raw.slice(0, 300));
    return { personal: [], preferences: [], development_instructions: [], projects: [], tools: [] };
  }
}

// ── Step 2: Merge facts into existing file content ────────────────────────────
async function mergeIntoFile(
  existingContent: string,
  facts: Array<{ key: string; value: string; confidence: number }>,
  fileTitle: string,
  dateStr: string,
  curatorPrompt: string,
  provider: string,
  model: string,
  apiKey: string
): Promise<string> {
  if (!facts.length) return existingContent;

  const factsFormatted = facts
    .map((f) => `- **${f.key}**: ${f.value} *(confidence: ${f.confidence}, date: ${dateStr})*`)
    .join("\n");

  const userContent = `TASK: MERGE_FACTS\n\nFile title: ${fileTitle}\n\nExisting content:\n${existingContent || "(empty — create from scratch)"}\n\nNew facts to incorporate:\n${factsFormatted}\n\nToday's date: ${dateStr}\n\nReturn ONLY the updated markdown content. No code fences, no explanation.`;

  const merged = await callLLM(provider, model, apiKey, curatorPrompt, userContent, 4096);
  return stripFences(merged);
}

async function upsertKnowledgeFileRecord(
  supabase: any,
  record: Record<string, unknown>,
): Promise<"created" | "updated"> {
  const { data: existing } = await supabase
    .from("knowledge_files")
    .select("file_id")
    .eq("file_id", record.file_id)
    .maybeSingle();

  await supabase.from("knowledge_files").upsert(record, { onConflict: "file_id" });
  return existing ? "updated" : "created";
}

// ── Step 3: Check line count and split if over limit ─────────────────────────
async function splitFileIfNeeded(
  supabase: any,
  fileId: string,
  filePath: string,
  domain: string,
  fileTitle: string,
  content: string,
  confidence: number,
  curatorPrompt: string,
  provider: string,
  model: string,
  apiKey: string,
  dateStr: string
): Promise<{ wasplit: boolean; newFileIds: string[]; filesCreated: number; filesUpdated: number }> {
  const lineCount = content.split("\n").length;
  if (lineCount <= MAX_LINES) return { wasplit: false, newFileIds: [], filesCreated: 0, filesUpdated: 0 };

  console.log(`File ${fileId} has ${lineCount} lines — splitting into subcategories...`);

  const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
  const baseName = filePath.split("/").pop()!.replace(".md", "");

  const userContent = `TASK: SPLIT_FILE\n\nFile: ${filePath} (${lineCount} lines — exceeds ${MAX_LINES} line limit)\nTitle: ${fileTitle}\n\nContent to split:\n${content}\n\nFolder path: ${folderPath}/\nBase filename: ${baseName}\nToday's date: ${dateStr}\n\nIdentify 2-4 natural subcategories and split the content.\nEach split file MUST be under ${MAX_LINES} lines.\nMake the parent file an index that lists the split files.\n\nReturn ONLY valid JSON:\n{\n  "parent_becomes_index": true,\n  "files": [\n    {\n      "file_id": "knowledge-${baseName}-subcategory-name",\n      "file_path": "${folderPath}/subcategory-name.md",\n      "title": "Descriptive Title",\n      "content": "full markdown content here"\n    }\n  ],\n  "parent_content": "# ${fileTitle}\\n\\nThis topic has been split into subcategories:\\n..."\n}`;

  const raw = await callLLM(provider, model, apiKey, curatorPrompt, userContent, 4096);

  let splitResult: any;
  try {
    splitResult = JSON.parse(stripFences(raw));
  } catch {
    console.error("Split parse failed:", raw.slice(0, 300));
    return { wasplit: false, newFileIds: [], filesCreated: 0, filesUpdated: 0 };
  }

  const newFileIds: string[] = [];
  let filesCreated = 0;
  let filesUpdated = 0;

  // Upsert each split file
  if (Array.isArray(splitResult.files)) {
    for (const f of splitResult.files) {
      if (!f.file_id || !f.file_path || !f.content) continue;
      const splitLines = f.content.split("\n").length;
      if (splitLines > MAX_LINES) {
        console.warn(`Split file ${f.file_id} still has ${splitLines} lines — accepting anyway`);
      }
      const splitWriteResult = await upsertKnowledgeFileRecord(supabase, {
        file_id: f.file_id,
        file_path: f.file_path,
        domain,
        subdomain: domain,
        title: f.title || f.file_id,
        summary: (f.content as string).split("\n").find((l: string) => l.trim() && !l.startsWith("#")) || f.title,
        content: f.content,
        word_count: (f.content as string).split(/\s+/).length,
        confidence_min: confidence,
        schema_version: "1.0",
        is_valid: true,
      });
      if (splitWriteResult === "created") filesCreated += 1;
      else filesUpdated += 1;
      newFileIds.push(f.file_id);
    }
  }

  // Update parent file to become an index
  if (splitResult.parent_content) {
    const parentWriteResult = await upsertKnowledgeFileRecord(supabase, {
      file_id: fileId,
      file_path: filePath,
      domain,
      subdomain: domain,
      title: fileTitle,
      summary: `Index file — split into ${newFileIds.length} subcategories on ${dateStr}`,
      content: splitResult.parent_content,
      word_count: (splitResult.parent_content as string).split(/\s+/).length,
      confidence_min: confidence,
      schema_version: "1.0",
      is_valid: true,
    });
    if (parentWriteResult === "created") filesCreated += 1;
    else filesUpdated += 1;
  }

  return { wasplit: true, newFileIds, filesCreated, filesUpdated };
}

// ── Step 4: Upsert a knowledge file ──────────────────────────────────────────
async function upsertFile(
  supabase: any,
  fileId: string,
  filePath: string,
  domain: string,
  title: string,
  content: string,
  confidence: number
): Promise<"created" | "updated"> {
  const summary = content.split("\n").find((l) => l.trim() && !l.startsWith("#")) || content.slice(0, 200);
  return upsertKnowledgeFileRecord(supabase, {
    file_id: fileId,
    file_path: filePath,
    domain,
    subdomain: domain,
    title,
    summary: summary.slice(0, 300),
    content,
    word_count: content.split(/\s+/).length,
    confidence_min: confidence,
    schema_version: "1.0",
    is_valid: true,
  });
}

// ── Step 5: Auto-regenerate folder README ────────────────────────────────────
async function regenerateFolderReadme(
  supabase: any,
  domain: string,
  folderPath: string,
): Promise<"created" | "updated" | null> {
  const { data: files } = await supabase
    .from("knowledge_files")
    .select("file_id, title, summary, file_path, confidence_min, updated_at")
    .eq("domain", domain)
    .eq("is_valid", true)
    .not("file_path", "ilike", "%README%")
    .order("file_path");

  if (!files?.length) return null;

  const now = new Date().toISOString().slice(0, 10);
  const rows = files
    .map((f: any) => {
      const fname = f.file_path.split("/").pop();
      const desc = (f.summary || f.title || "").slice(0, 100);
      const conf = f.confidence_min ? ` *(conf: ${Number(f.confidence_min).toFixed(2)})*` : "";
      return `| ${fname} | ${desc}${conf} |`;
    })
    .join("\n");

  const readmeContent = `# ${domain.charAt(0).toUpperCase() + domain.slice(1).replace(/-/g, " ")}\n\n*Last updated: ${now} — maintained by the Knowledge Curator*\n\n## Files\n\n| File | Description |\n|---|---|\n${rows}\n`;

  return upsertKnowledgeFileRecord(supabase, {
    file_id: `readme-${domain}`,
    file_path: `${folderPath}/README.md`,
    domain: "readme",
    subdomain: domain,
    title: `${domain} — README`,
    summary: `Index of all files in the ${domain} knowledge folder. Last updated ${now}.`,
    content: readmeContent,
    word_count: readmeContent.split(/\s+/).length,
    confidence_min: 1.0,
    schema_version: "1.0",
    is_valid: true,
  });
}

// ── Step 6: Regenerate root README ───────────────────────────────────────────
async function regenerateRootReadme(supabase: any): Promise<"created" | "updated"> {
  const { data: readmes } = await supabase
    .from("knowledge_files")
    .select("subdomain, summary, updated_at")
    .eq("domain", "readme")
    .eq("is_valid", true)
    .neq("file_id", "readme-root")
    .order("subdomain");

  const now = new Date().toISOString().slice(0, 10);
  const rows = (readmes || [])
    .map((r: any) => `| ${r.subdomain}/ | ${(r.summary || "").slice(0, 120)} |`)
    .join("\n");

  const content = `# Knowledge Base\n\n*Last updated: ${now} — maintained by the Knowledge Curator (cron: Daily Memory Summarizer)*\n\n## Folders\n\n| Folder | Purpose |\n|---|---|\n${rows}\n\n## Architecture\n\n- Max file size: 300 lines (auto-split into subcategories when exceeded)\n- Context Agent reads this README + folder READMEs to route knowledge to the right agent\n- Each agent receives ONLY the 2-4 files relevant to its task\n`;

  return upsertKnowledgeFileRecord(supabase, {
    file_id: "readme-root",
    file_path: "knowledge/README.md",
    domain: "readme",
    subdomain: "root",
    title: "Knowledge Base — Root Index",
    summary: "Root index of all knowledge folders. Maintained by the Knowledge Curator.",
    content,
    word_count: content.split(/\s+/).length,
    confidence_min: 1.0,
    schema_version: "1.0",
    is_valid: true,
  });
}

async function summarizeNightReport(
  summarizer: { prompt: string; provider: string; model: string; apiKey: string },
  reportInput: string,
): Promise<string> {
  const fallbackPrompt =
    "You write concise operator summaries for nightly maintenance runs. Return plain text only. Keep it under 80 words.";
  const raw = await callLLM(
    summarizer.provider,
    summarizer.model,
    summarizer.apiKey,
    summarizer.prompt || fallbackPrompt,
    reportInput,
    512,
  );
  return stripFences(raw).replace(/\s+/g, " ").trim();
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let supabase: any = null;
  let reportDate = "";
  let processingDate = "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json().catch(() => ({}));
    const ownerUserId =
      typeof body?.owner_user_id === "string" && body.owner_user_id.length > 0
        ? body.owner_user_id
        : null;

    const curator = await resolveAgentExecution(supabase, "knowledge-curator", ownerUserId);
    let nightReportSummarizer:
      | { prompt: string; provider: string; model: string; apiKey: string }
      | null = null;
    try {
      nightReportSummarizer = await resolveAgentExecution(supabase, "night-report-summarizer", ownerUserId);
    } catch {
      nightReportSummarizer = null;
    }

    // ── Target: exactly the day before yesterday ───────────────────────────────
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 2);
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const dateStr = targetDate.toISOString().slice(0, 10);
    const processingDateStr = new Date().toISOString().slice(0, 10);
    reportDate = dateStr;
    processingDate = processingDateStr;

    await supabase.from("night_reports").upsert({
      report_date: dateStr,
      processing_date: processingDateStr,
      status: "running",
      files_created: 0,
      files_updated: 0,
      files_split: 0,
      dedup_count: 0,
      summary: null,
      errors: [],
      started_at: new Date().toISOString(),
      completed_at: null,
      idempotency_key: `night-report-${dateStr}`,
    }, { onConflict: "report_date" });

    // ── Fetch messages from that day ───────────────────────────────────────────
    const { data: dayMessages, error: msgErr } = await supabase
      .from("chat_messages")
      .select("id, role, content, agent_id, created_at")
      .gte("created_at", dayStart.toISOString())
      .lte("created_at", dayEnd.toISOString())
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });

    if (msgErr) throw new Error(`Failed to fetch messages: ${msgErr.message}`);

    if (!dayMessages || dayMessages.length === 0) {
      const noMessageInput = [
        `Report date: ${dateStr}`,
        `Processing date: ${processingDateStr}`,
        "Messages processed: 0",
        "Facts extracted: 0",
        "Files created: 0",
        "Files updated: 0",
        "Files split: 0",
        "No messages were available for this report date.",
      ].join("\n");

      let summary = `No messages were available for ${dateStr}.`;
      if (nightReportSummarizer) {
        try {
          summary = await summarizeNightReport(nightReportSummarizer, noMessageInput);
        } catch {
          // Keep the fallback summary if the summarizer agent is unavailable.
        }
      }

      await supabase.from("night_reports").update({
        status: "completed",
        files_created: 0,
        files_updated: 0,
        files_split: 0,
        dedup_count: 0,
        summary,
        errors: [],
        completed_at: new Date().toISOString(),
      }).eq("report_date", dateStr);

      return new Response(
        JSON.stringify({ success: true, message: `No messages for ${dateStr}`, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Format conversation ────────────────────────────────────────────────────
    const conversation = dayMessages
      .map((m: any) => `[${m.role.toUpperCase()} | ${m.agent_id || "?"} | ${m.created_at?.slice(11, 16)}]\n${m.content}`)
      .join("\n\n---\n\n");

    // ── Extract structured facts using knowledge-curator ───────────────────────
    const extracted = await extractFacts(
      conversation,
      curator.prompt,
      curator.provider,
      curator.model,
      curator.apiKey,
    );

    const updatedDomains = new Set<string>();
    let totalFacts = 0;
    const splitLog: string[] = [];
    let filesCreated = 0;
    let filesUpdated = 0;
    let filesSplit = 0;

    // ── Process each category ─────────────────────────────────────────────────
    for (const [category, meta] of Object.entries(CATEGORY_FILES)) {
      const facts = extracted[category] || [];
      if (!facts.length) continue;
      totalFacts += facts.length;

      // Fetch existing file content
      const { data: existing } = await supabase
        .from("knowledge_files")
        .select("content, confidence_min")
        .eq("file_id", meta.fileId)
        .single();

      // Merge new facts into existing content using knowledge-curator
      const mergedContent = await mergeIntoFile(
        existing?.content || "",
        facts,
        meta.title,
        dateStr,
        curator.prompt,
        curator.provider,
        curator.model,
        curator.apiKey
      );

      // Blend confidence (trust accumulates over time)
      const avgConf = facts.reduce((s, f) => s + f.confidence, 0) / facts.length;
      const blendedConf = existing
        ? Math.min(0.99, (existing.confidence_min + avgConf) / 2 + 0.05)
        : avgConf;

      const mergedLineCount = mergedContent.split("\n").length;
      updatedDomains.add(meta.domain);

      if (mergedLineCount > MAX_LINES) {
        const splitResult = await splitFileIfNeeded(
          supabase,
          meta.fileId,
          meta.filePath,
          meta.domain,
          meta.title,
          mergedContent,
          blendedConf,
          curator.prompt,
          curator.provider,
          curator.model,
          curator.apiKey,
          dateStr,
        );

        if (splitResult.wasplit) {
          filesCreated += splitResult.filesCreated;
          filesUpdated += splitResult.filesUpdated;
          filesSplit += 1;
          splitLog.push(`${meta.filePath} → split into ${splitResult.newFileIds.length} subcategories: [${splitResult.newFileIds.join(", ")}]`);
          continue;
        }
      }

      const writeResult = await upsertFile(
        supabase,
        meta.fileId,
        meta.filePath,
        meta.domain,
        meta.title,
        mergedContent,
        blendedConf,
      );
      if (writeResult === "created") filesCreated += 1;
      else filesUpdated += 1;
    }

    // ── Save daily audit file ─────────────────────────────────────────────────
    if (totalFacts > 0) {
      const auditContent = [
        `# Daily Fact Extraction — ${dateStr}`,
        ``,
        `*Processed ${dayMessages.length} messages. Extracted ${totalFacts} facts.*`,
        ``,
        ...(splitLog.length ? [`## Files Split\n${splitLog.map((s) => `- ${s}`).join("\n")}`, ``] : []),
        `## Extracted Facts`,
        ``,
        ...Object.entries(extracted)
          .filter(([, facts]) => facts.length > 0)
          .map(([cat, facts]) =>
            `### ${cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}\n` +
            (facts as any[]).map((f) => `- **${f.key}**: ${f.value} *(confidence: ${f.confidence})*`).join("\n")
          ),
      ].join("\n");

      const auditWriteResult = await upsertFile(
        supabase,
        `memory-summary-${dateStr}`,
        `knowledge/memory-summaries/${dateStr}.md`,
        "memory-summaries",
        `Daily Summary ${dateStr}`,
        auditContent,
        0.8,
      );
      if (auditWriteResult === "created") filesCreated += 1;
      else filesUpdated += 1;
      updatedDomains.add("memory-summaries");
    }

    // ── Regenerate READMEs ────────────────────────────────────────────────────
    const folderPaths: Record<string, string> = {
      personal: "knowledge/personal",
      development: "knowledge/development",
      "memory-summaries": "knowledge/memory-summaries",
    };

    for (const domain of updatedDomains) {
      const fp = folderPaths[domain];
      if (fp) {
        const readmeWriteResult = await regenerateFolderReadme(supabase, domain, fp);
        if (readmeWriteResult === "created") filesCreated += 1;
        else if (readmeWriteResult === "updated") filesUpdated += 1;
      }
    }
    if (updatedDomains.size > 0) {
      const rootReadmeWriteResult = await regenerateRootReadme(supabase);
      if (rootReadmeWriteResult === "created") filesCreated += 1;
      else filesUpdated += 1;
    }

    // ── Delete processed messages ─────────────────────────────────────────────
    const ids = dayMessages.map((m: any) => m.id);
    if (ids.length > 0) {
      await supabase.from("chat_messages").delete().in("id", ids);
    }

    const reportInput = [
      `Report date: ${dateStr}`,
      `Processing date: ${processingDateStr}`,
      `Messages processed: ${dayMessages.length}`,
      `Facts extracted: ${totalFacts}`,
      `Files created: ${filesCreated}`,
      `Files updated: ${filesUpdated}`,
      `Files split: ${filesSplit}`,
      `Folders updated: ${[...updatedDomains].join(", ") || "none"}`,
      splitLog.length ? `Split operations:\n${splitLog.map((entry) => `- ${entry}`).join("\n")}` : "Split operations: none",
    ].join("\n\n");

    let nightReportSummary = `Processed ${dayMessages.length} messages, extracted ${totalFacts} facts, and updated ${filesCreated + filesUpdated} files.`;
    if (nightReportSummarizer) {
      try {
        nightReportSummary = await summarizeNightReport(nightReportSummarizer, reportInput);
      } catch {
        // Keep the fallback summary if the summarizer agent fails.
      }
    }

    await supabase.from("night_reports").update({
      status: "completed",
      files_created: filesCreated,
      files_updated: filesUpdated,
      files_split: filesSplit,
      dedup_count: 0,
      summary: nightReportSummary,
      errors: [],
      completed_at: new Date().toISOString(),
    }).eq("report_date", dateStr);

    return new Response(
      JSON.stringify({
        success: true,
        date_processed: dateStr,
        messages_processed: dayMessages.length,
        facts_extracted: totalFacts,
        folders_updated: [...updatedDomains],
        files_split: splitLog,
        curator_agent: "knowledge-curator",
        night_report_summary: nightReportSummary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("summarize-memory error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";

    if (supabase && reportDate) {
      await supabase.from("night_reports").upsert({
        report_date: reportDate,
        processing_date: processingDate || new Date().toISOString().slice(0, 10),
        status: "failed",
        errors: [message],
        completed_at: new Date().toISOString(),
      }, { onConflict: "report_date" });
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
