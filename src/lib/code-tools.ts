export type ToolAgent = {
  agent_id: string;
  name: string;
  purpose: string;
  role: string;
  is_active: boolean;
  capability_tags: string[] | null;
  model: string | null;
  instructions_md: string | null;
};

export type CodeToolCatalogRow = {
  agent_id: string;
  folder_path: string;
  tool_name: string;
  summary: string;
  execution_mode: "code" | "hybrid";
  classification_reason: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

export type CodeToolFolderDocRow = {
  folder_path: string;
  folder_name: string;
  parent_path: string | null;
  depth: number;
  readme_title: string;
  readme_content: string;
  tool_count: number;
  child_folder_count: number;
};

type ToolSeed = Pick<ToolAgent, "agent_id" | "name" | "purpose" | "role" | "capability_tags" | "model" | "instructions_md"> & {
  is_active: boolean;
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

export const codeToolAgentSeeds: ToolSeed[] = [
  {
    agent_id: "memory-retriever",
    name: "Memory Retriever",
    role: "infrastructure",
    purpose: "Searches recent conversation memory chunks for the most relevant context snippets.",
    is_active: true,
    capability_tags: ["memory", "retrieval", "context", "internal-tool"],
    model: null,
    instructions_md: `You are the Memory Retriever. Code-only agent.

PURPOSE: Embed user queries into vectors and search the recent_memory_chunks table for relevant context from the last 72 hours.

WORKFLOW:
1. Receive a query string
2. Generate embedding via configured model
3. Call search_recent_memory() with the embedding
4. Return top matching chunks with similarity scores

This agent does not use an LLM model - it runs deterministic code operations only.`,
  },
  {
    agent_id: "knowledge-selector",
    name: "Knowledge Selector",
    role: "infrastructure",
    purpose: "Chooses the most relevant long-term knowledge files for the active task.",
    is_active: true,
    capability_tags: ["knowledge", "selection", "context", "internal-tool"],
    model: null,
    instructions_md: `You are the Knowledge Selector. You pick relevant long-term knowledge files for a given task.

PURPOSE: Given a user request, scan the knowledge_files index and return a list of file_ids that are most relevant.

WORKFLOW:
1. Receive the user query and the knowledge index (titles, summaries, domains)
2. Score each file for relevance
3. Return the top 3-5 file_ids ordered by relevance

RESPONSE FORMAT:
Return a JSON array of file_ids: ["file-001", "file-002"]

Be conservative - only select files that are clearly relevant to the query.`,
  },
  {
    agent_id: "knowledge-loader",
    name: "Knowledge Loader",
    role: "infrastructure",
    purpose: "Loads, validates, and trims selected knowledge files into an execution-ready context packet.",
    is_active: true,
    capability_tags: ["knowledge", "loading", "context", "internal-tool"],
    model: null,
    instructions_md: `You are the Knowledge Loader. Code-only agent.

PURPOSE: Open, validate, and trim knowledge files selected by the Knowledge Selector.

WORKFLOW:
1. Receive a list of file_ids from the Knowledge Selector
2. Query knowledge_files table for full content
3. Validate each file (check is_valid, schema_version)
4. Trim content if it exceeds token budget
5. Return assembled context packet

This agent does not use an LLM model - it runs deterministic code operations only.`,
  },
  {
    agent_id: "agent-picker",
    name: "Agent Picker",
    role: "infrastructure",
    purpose: "Selects the best specialist agent for a task based on capability tags and constraints.",
    is_active: true,
    capability_tags: ["routing", "agent-selection", "internal-tool"],
    model: null,
    instructions_md: `You are the Agent Picker. Code-first agent.

PURPOSE: Given a task type and required capabilities, select the best specialist agent to handle it.

WORKFLOW:
1. Receive task_type, capability requirements, and constraints
2. Query active agents filtered by role = "specialist"
3. Match capability_tags against requirements
4. Check agent policies for compatibility
5. Return the selected agent_id

SELECTION PRIORITY:
1. Exact capability match
2. Most relevant tags
3. Currently active and within budget

This agent primarily runs code logic with minimal LLM usage for edge cases.`,
  },
  {
    agent_id: "privileged-writer",
    name: "Privileged Writer",
    role: "infrastructure",
    purpose: "Performs protected write operations after policy validation and authorization checks.",
    is_active: true,
    capability_tags: ["writes", "security", "internal-tool"],
    model: null,
    instructions_md: `You are the Privileged Writer. Code-only infrastructure tool.

PURPOSE: Execute write operations that require elevated permissions - database mutations, file system writes, credential updates, and configuration changes.

SECURITY RULES:
1. Only execute writes explicitly authorized by the Orchestrator
2. Validate every write request against the agent_policies table
3. Log all write operations to audit logs
4. Reject any write that lacks proper authorization chain
5. Never expose raw credentials or secrets in outputs

This agent does not use an LLM model - it runs deterministic code operations only.`,
  },
];

export function normalizeFolderPath(path: string | null | undefined): string {
  if (!path) return "";
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function folderNameFromPath(path: string): string {
  if (!path) return "Tools";
  const last = path.split("/").at(-1) || path;
  return last
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parentFolderPath(path: string): string | null {
  const normalized = normalizeFolderPath(path);
  if (!normalized) return null;
  const parts = normalized.split("/");
  parts.pop();
  return parts.length ? parts.join("/") : "";
}

function scoreFolder(agent: ToolAgent, folderPath: string, keywords: string[]): number {
  const haystack = `${agent.agent_id} ${agent.name} ${agent.purpose} ${(agent.capability_tags || []).join(" ")} ${agent.instructions_md || ""}`.toLowerCase();
  return keywords.reduce((sum, keyword) => (haystack.includes(keyword) ? sum + 1 : sum), 0) + (haystack.includes(folderPath.split("/").at(-1) || "") ? 0.25 : 0);
}

export function isCodeToolAgent(agent: ToolAgent): boolean {
  const override = CODE_TOOL_ID_OVERRIDES[agent.agent_id];
  if (override) return true;

  const haystack = `${agent.purpose} ${(agent.capability_tags || []).join(" ")} ${agent.instructions_md || ""}`.toLowerCase();
  return CODE_TOOL_MARKERS.some((marker) => haystack.includes(marker));
}

export function inferToolExecutionMode(agent: ToolAgent): "code" | "hybrid" {
  const override = CODE_TOOL_ID_OVERRIDES[agent.agent_id];
  if (override) return override.execution_mode;

  const haystack = `${agent.purpose} ${(agent.capability_tags || []).join(" ")} ${agent.instructions_md || ""}`.toLowerCase();
  if (haystack.includes("code-first") || haystack.includes("minimal llm")) return "hybrid";
  return "code";
}

export function inferToolFolderPath(agent: ToolAgent): string {
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

export function catalogFromAgents(agents: ToolAgent[]): CodeToolCatalogRow[] {
  return agents
    .filter(isCodeToolAgent)
    .map((agent) => {
      const override = CODE_TOOL_ID_OVERRIDES[agent.agent_id];
      return {
        agent_id: agent.agent_id,
        folder_path: inferToolFolderPath(agent),
        tool_name: agent.name,
        summary: agent.purpose,
        execution_mode: inferToolExecutionMode(agent),
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

function folderPurpose(folderPath: string): string {
  if (!folderPath) return "Top-level browser for all code-only tools.";
  if (folderPath.endsWith("context")) return "Context loading and retrieval tools that prepare execution state.";
  if (folderPath.endsWith("routing")) return "Routing and selection tools that decide where work goes next.";
  if (folderPath.endsWith("execution")) return "Protected execution tools that perform validated write operations.";
  if (folderPath.endsWith("misc")) return "Code-only tools that do not fit a more specific runtime bucket yet.";
  if (folderPath === "runtime") return "Internal runtime folders that organize code-only tools.";
  return "Auto-generated folder for code-only tool organization.";
}

function folderPickerHint(folderPath: string): string {
  if (!folderPath) return "Start here when you need to decide whether the task is about context, routing, or execution.";
  if (folderPath.endsWith("context")) return "Pick from this folder when an agent needs memory, knowledge files, or prepared context before it can act.";
  if (folderPath.endsWith("routing")) return "Pick from this folder when the task is to classify work, choose a target agent, or decide the next execution path.";
  if (folderPath.endsWith("execution")) return "Pick from this folder only when validated write operations or protected actions are required.";
  if (folderPath.endsWith("misc")) return "Pick from this folder only if the task does not match a clearer runtime category.";
  if (folderPath === "runtime") return "Use this level to choose the correct runtime subfolder before selecting a specific tool.";
  return "Read the tool summaries in this folder and pick the narrowest tool that directly matches the task.";
}

function joinRelativePath(parentPath: string, childName: string): string {
  return parentPath ? `${parentPath}/${childName}` : childName;
}

export function buildFolderDocs(entries: CodeToolCatalogRow[]): CodeToolFolderDocRow[] {
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
      const childFolders = Array.from(folderPaths)
        .filter((candidate) => parentFolderPath(candidate) === folderPath)
        .sort((left, right) => left.localeCompare(right));
      const tools = entries.filter((entry) => normalizeFolderPath(entry.folder_path) === folderPath);
      const lines = [
        `# ${folderPath ? `${folderNameFromPath(folderPath)}/` : "Tools/"}`,
        "",
        `Auto-generated guide for \`${folderPath || "/"}\`.`,
        "",
        "## Folder Purpose",
        folderPurpose(folderPath),
        "",
        "## Picker Guidance",
        folderPickerHint(folderPath),
        "",
      ];

      lines.push("## Child Folders");
      if (childFolders.length > 0) {
        for (const childPath of childFolders) {
          lines.push(`- \`${folderNameFromPath(childPath)}/\` - ${folderPurpose(childPath)} Pick it when: ${folderPickerHint(childPath)}`);
        }
      } else {
        lines.push("- No subfolders yet.");
      }
      lines.push("");

      lines.push("## Tool Files");
      if (tools.length === 0) {
        lines.push("- No code tools are currently assigned to this folder.");
      } else {
        for (const tool of tools) {
          lines.push(`- \`${tool.tool_name}\` (\`${tool.agent_id}\`) - mode: ${tool.execution_mode}; purpose: ${tool.summary}; classification: ${tool.classification_reason || "derived from tool metadata"}`);
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
