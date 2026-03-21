import { callEdgeJson } from "@/lib/edge-functions";

export type WorkspaceBranch = "computer" | "runs" | "learning" | "agents" | "knowledge" | "vault";

export type WorkspaceEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  modifiedAt: string | null;
};

export type AgentPromptPreview = {
  agent_id: string;
  instructions_md: string | null;
  model: string | null;
  name: string;
  role: string;
  purpose: string;
  is_active: boolean;
  allowed_tools: string[];
  prompt_path: string;
  prompt_content: string;
  model_meta: {
    model_id: string;
    display_name: string;
    provider: string;
    context_window_tokens: number | null;
    default_output_tokens: number | null;
  } | null;
  recent_task_domains: string[];
};

export async function getWorkspaceInfo() {
  return callEdgeJson<{ root: string; computer_root_label: string }>("workspace-files", { action: "workspace_info" });
}

export async function listWorkspaceBranch(branch: WorkspaceBranch, path = "") {
  return callEdgeJson<{ entries: WorkspaceEntry[] }>("workspace-files", {
    action: "list_branch_entries",
    branch,
    path,
  });
}

export async function readWorkspaceBranchFile(branch: WorkspaceBranch, path: string) {
  return callEdgeJson<{
    file: {
      name: string;
      path: string;
      content: string;
      modifiedAt: string | null;
      size: number;
    };
  }>("workspace-files", {
    action: "read_branch_file",
    branch,
    path,
  });
}

export async function getRecentRunSummaries(limit = 50) {
  return callEdgeJson<{
    summaries: Array<{
      fileName: string;
      path: string;
      modifiedAt: string | null;
      size: number;
      objective: string;
      result: string;
      blockers: string;
    }>;
  }>("workspace-files", {
    action: "recent_summaries",
    limit,
  });
}

export async function readAgentPromptPreview(agentId: string) {
  return callEdgeJson<{ agent: AgentPromptPreview }>("workspace-files", {
    action: "read_agent_prompt",
    agent_id: agentId,
  });
}

export async function saveAgentPromptFile(agentId: string, content: string) {
  return callEdgeJson<{ success: boolean; prompt_path: string }>("workspace-files", {
    action: "write_agent_prompt",
    agent_id: agentId,
    content,
  });
}

export async function syncAgentPromptFiles() {
  return callEdgeJson<{ success: boolean; synced: number }>("workspace-files", {
    action: "sync_agent_prompts",
  });
}

export async function exportWorkspaceBranchFiles(branch: "agents" | "knowledge" | "runs" | "learning") {
  return callEdgeJson<{
    files: Array<{
      path: string;
      content: string;
      modifiedAt: string | null;
      size: number;
    }>;
  }>("workspace-files", {
    action: "export_branch_files",
    branch,
  });
}
