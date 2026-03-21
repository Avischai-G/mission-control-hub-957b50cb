import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Brain,
  FileCode2,
  FileText,
  FolderOpen,
  Hammer,
  HardDrive,
  Loader2,
  Save,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ExplorerBrowserLayout, type ExplorerPathCrumb } from "@/components/explorer/ExplorerBrowserLayout";
import { ExplorerListItem } from "@/components/explorer/ExplorerListItem";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { runtimeToolDefinitions } from "@/lib/runtime-tools";
import {
  type AgentPromptPreview,
  type WorkspaceBranch,
  type WorkspaceEntry,
  getWorkspaceInfo,
  listWorkspaceBranch,
  readAgentPromptPreview,
  readWorkspaceBranchFile,
  saveAgentPromptFile,
} from "@/lib/workspace-files";
import { buildContextEstimate } from "@/lib/context-indicator";
import { ContextIndicatorPill } from "@/components/context/ContextIndicatorPill";

type AgentRow = {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  purpose: string;
  is_active: boolean;
  model: string | null;
  model_display_name?: string | null;
  context_window_tokens?: number | null;
  default_output_tokens?: number | null;
};

type KnowledgeRow = {
  id: string;
  file_id: string;
  file_path: string;
  title: string;
  summary: string | null;
  content: string;
  updated_at: string;
  domain: string;
  subdomain: string | null;
};

type BranchId = "computer" | "agents" | "tools" | "knowledge" | "runs" | "learning";

type BranchSelection =
  | { kind: "root"; branch: null }
  | { kind: "branch"; branch: BranchId }
  | { kind: "agent"; branch: "agents"; agentId: string }
  | { kind: "tool"; branch: "tools"; toolName: string }
  | { kind: "knowledge"; branch: "knowledge"; fileId: string }
  | { kind: "workspace-file"; branch: "computer" | "runs" | "learning"; path: string };

const ROOT_BRANCHES: Array<{
  id: BranchId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    id: "computer",
    title: "Computer",
    subtitle: "Browse the real machine view. Windows/AppData/program files are hidden, and normal files stay read-only.",
    icon: <HardDrive className="h-4 w-4" />,
  },
  { id: "agents", title: "Agents", subtitle: "Preview agents, prompts, permissions, and context windows.", icon: <Bot className="h-4 w-4" /> },
  { id: "tools", title: "Tools", subtitle: "Runtime tools available inside the app explorer only.", icon: <Hammer className="h-4 w-4" /> },
  { id: "knowledge", title: "Knowledge", subtitle: "Long-term knowledge files mirrored into the browser UI.", icon: <Brain className="h-4 w-4" /> },
  { id: "runs", title: "Runs", subtitle: "Raw daily run summaries written to the workspace.", icon: <FileText className="h-4 w-4" /> },
  { id: "learning", title: "Learning Reports", subtitle: "Nightly learning and morning digest source files.", icon: <Sparkles className="h-4 w-4" /> },
];

export function FilesExplorerPage() {
  const { toast } = useToast();
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [computerRootLabel, setComputerRootLabel] = useState("Computer");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<BranchSelection>({ kind: "branch", branch: "computer" });
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentPreview, setAgentPreview] = useState<AgentPromptPreview | null>(null);
  const [agentDraftPrompt, setAgentDraftPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeRow[]>([]);
  const [workspaceEntries, setWorkspaceEntries] = useState<Record<WorkspaceBranch, WorkspaceEntry[]>>({
    computer: [],
    agents: [],
    knowledge: [],
    learning: [],
    runs: [],
    vault: [],
  });
  const [workspacePaths, setWorkspacePaths] = useState<Record<"computer" | "runs" | "learning", string>>({
    computer: "",
    runs: "",
    learning: "",
  });
  const [workspaceFilePreview, setWorkspaceFilePreview] = useState<{
    name: string;
    path: string;
    content: string;
    size: number;
    modifiedAt: string | null;
  } | null>(null);
  const [policies, setPolicies] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const [{ root, computer_root_label }, { data: agentRows, error: agentsError }, { data: policyRows, error: policyError }, { data: knowledgeRows, error: knowledgeError }, { data: modelRows, error: modelError }] = await Promise.all([
          getWorkspaceInfo(),
          supabase
            .from("agents")
            .select("id, agent_id, name, role, purpose, is_active, model")
            .order("role", { ascending: true })
            .order("name", { ascending: true }),
          supabase.from("agent_policies").select("agent_id, allowed_tools"),
          supabase
            .from("knowledge_files")
            .select("id, file_id, file_path, title, summary, content, updated_at, domain, subdomain")
            .eq("is_valid", true)
            .order("updated_at", { ascending: false })
            .limit(200),
          supabase
            .from("model_registry")
            .select("model_id, display_name, context_window_tokens, default_output_tokens")
            .eq("is_active", true),
        ]);

        if (agentsError) throw agentsError;
        if (policyError) throw policyError;
        if (knowledgeError) throw knowledgeError;
        if (modelError) throw modelError;

        const modelMetaById = new Map(
          ((modelRows as Array<{
            model_id: string;
            display_name: string;
            context_window_tokens: number | null;
            default_output_tokens: number | null;
          }>) || []).map((model) => [model.model_id, model]),
        );

        const nextAgents = ((agentRows as AgentRow[]) || []).map((agent) => {
          const modelMeta = agent.model ? modelMetaById.get(agent.model) : null;
          return {
            ...agent,
            model_display_name: modelMeta?.display_name || null,
            context_window_tokens: modelMeta?.context_window_tokens ?? null,
            default_output_tokens: modelMeta?.default_output_tokens ?? null,
          };
        });

        setWorkspaceRoot(root);
        setComputerRootLabel(computer_root_label || "Computer");
        setAgents(nextAgents);
        setKnowledgeFiles((knowledgeRows as KnowledgeRow[]) || []);
        setPolicies(
          Object.fromEntries(
            ((policyRows as Array<{ agent_id: string; allowed_tools: string[] | null }>) || []).map((row) => [
              row.agent_id,
              row.allowed_tools || [],
            ]),
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load the file explorer.";
        setLoadError(message);
        toast({
          title: "Files could not load",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [toast]);

  useEffect(() => {
    const branch = selection.kind === "workspace-file" || selection.kind === "branch"
      ? selection.branch
      : null;

    if (branch !== "computer" && branch !== "runs" && branch !== "learning") {
      return;
    }

    const currentPath = workspacePaths[branch];

    const loadBranch = async () => {
      try {
        const { entries } = await listWorkspaceBranch(branch, currentPath);
        setWorkspaceEntries((current) => ({ ...current, [branch]: entries }));
      } catch (error) {
        toast({
          title: `Could not load ${branchLabel(branch).toLowerCase()}`,
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

    void loadBranch();
  }, [selection, toast, workspacePaths]);

  useEffect(() => {
    if (selection.kind !== "agent") {
      setAgentPreview(null);
      setAgentDraftPrompt("");
      return;
    }

    const loadAgent = async () => {
      try {
        const { agent } = await readAgentPromptPreview(selection.agentId);
        setAgentPreview(agent);
        setAgentDraftPrompt(agent.prompt_content || "");
      } catch (error) {
        toast({
          title: "Could not load agent preview",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

    void loadAgent();
  }, [selection, toast]);

  useEffect(() => {
    if (selection.kind !== "workspace-file") {
      setWorkspaceFilePreview(null);
      return;
    }

    const loadPreview = async () => {
      try {
        const { file } = await readWorkspaceBranchFile(selection.branch, selection.path);
        setWorkspaceFilePreview(file);
      } catch (error) {
        toast({
          title: "Could not preview file",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

    void loadPreview();
  }, [selection, toast]);

  const currentBranch = selection.kind === "root" ? null : selection.branch;

  const breadcrumbs = useMemo<ExplorerPathCrumb[]>(() => {
    if (!currentBranch) return [];

    if (currentBranch === "computer" || currentBranch === "runs" || currentBranch === "learning") {
      const parts = workspacePaths[currentBranch].split("/").filter(Boolean);
      const rootLabel = currentBranch === "computer" ? computerRootLabel : branchLabel(currentBranch);
      return [
        { label: rootLabel, path: currentBranch },
        ...parts.map((part, index) => ({
          label: part,
          path: `${currentBranch}/${parts.slice(0, index + 1).join("/")}`,
        })),
      ];
    }

    return [{ label: branchLabel(currentBranch), path: currentBranch }];
  }, [computerRootLabel, currentBranch, workspacePaths]);

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return agents;
    return agents.filter((agent) =>
      [agent.name, agent.agent_id, agent.role, agent.purpose, agent.model_display_name || "", agent.model || ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [agents, query]);

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return runtimeToolDefinitions;
    return runtimeToolDefinitions.filter((tool) =>
      [tool.name, tool.label, tool.description].join(" ").toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const filteredKnowledge = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return knowledgeFiles;
    return knowledgeFiles.filter((file) =>
      [file.title, file.file_path, file.summary || ""].join(" ").toLowerCase().includes(normalizedQuery),
    );
  }, [knowledgeFiles, query]);

  const currentWorkspaceEntries = currentBranch === "computer" || currentBranch === "runs" || currentBranch === "learning"
    ? workspaceEntries[currentBranch]
    : [];

  const listPane = (() => {
    if (!currentBranch) {
      return (
        <div className="space-y-2">
          {ROOT_BRANCHES.map((branch) => (
            <ExplorerListItem
              key={branch.id}
              icon={branch.icon}
              title={branch.title}
              subtitle={branch.subtitle}
              kindLabel="branch"
              onClick={() => setSelection({ kind: "branch", branch: branch.id })}
            />
          ))}
        </div>
      );
    }

    if (currentBranch === "agents") {
      return (
        <div className="space-y-2">
          {filteredAgents.map((agent) => (
            <ExplorerListItem
              key={agent.agent_id}
              icon={<Bot className="h-4 w-4" />}
              title={agent.name}
              subtitle={[
                agent.role,
                agent.model_display_name || agent.model || "no model",
                agent.context_window_tokens ? `${Math.round(agent.context_window_tokens / 1000)}k ctx` : null,
              ].filter(Boolean).join(" · ")}
              kindLabel="agent"
              selected={selection.kind === "agent" && selection.agentId === agent.agent_id}
              onClick={() => setSelection({ kind: "agent", branch: "agents", agentId: agent.agent_id })}
            />
          ))}
        </div>
      );
    }

    if (currentBranch === "tools") {
      return (
        <div className="space-y-2">
          {filteredTools.map((tool) => (
            <ExplorerListItem
              key={tool.name}
              icon={<Hammer className="h-4 w-4" />}
              title={tool.name}
              subtitle={tool.description}
              kindLabel="tool"
              selected={selection.kind === "tool" && selection.toolName === tool.name}
              onClick={() => setSelection({ kind: "tool", branch: "tools", toolName: tool.name })}
            />
          ))}
        </div>
      );
    }

    if (currentBranch === "knowledge") {
      return (
        <div className="space-y-2">
          {filteredKnowledge.map((file) => (
            <ExplorerListItem
              key={file.file_id}
              icon={<FileText className="h-4 w-4" />}
              title={file.title}
              subtitle={file.file_path}
              kindLabel="knowledge"
              selected={selection.kind === "knowledge" && selection.fileId === file.file_id}
              onClick={() => setSelection({ kind: "knowledge", branch: "knowledge", fileId: file.file_id })}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {currentWorkspaceEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-4 py-6 text-sm text-muted-foreground">
            No files in this location.
          </div>
        ) : currentWorkspaceEntries.map((entry) => (
          <ExplorerListItem
            key={entry.path}
            icon={entry.kind === "directory" ? <FolderOpen className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}
            title={entry.name}
            subtitle={entry.modifiedAt ? `Updated ${new Date(entry.modifiedAt).toLocaleString()}` : entry.path}
            kindLabel={entry.kind}
            selected={selection.kind === "workspace-file" && selection.path === entry.path}
            onClick={() => {
              if (entry.kind === "directory") {
                setWorkspacePaths((current) => ({ ...current, [currentBranch]: entry.path }));
                setSelection({ kind: "branch", branch: currentBranch });
                return;
              }
              setSelection({ kind: "workspace-file", branch: currentBranch, path: entry.path });
            }}
          />
        ))}
      </div>
    );
  })();

  const previewPane = (() => {
    if (loadError) {
      return (
        <PreviewCard title="Files unavailable" subtitle={workspaceRoot || computerRootLabel}>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </PreviewCard>
      );
    }

    if (!currentBranch) {
      return (
        <div className="space-y-5">
          <PreviewCard title="Files" subtitle={workspaceRoot}>
            <p className="text-sm text-muted-foreground">
              Browse the whole machine under Computer, inspect read-only tools and runtime summaries, and edit prompts only from an agent preview.
            </p>
          </PreviewCard>
        </div>
      );
    }

    if (selection.kind === "agent" && agentPreview) {
      const estimate = buildContextEstimate({
        promptContent: agentDraftPrompt,
        agentContextContent: [
          agentPreview.recent_task_domains?.join("\n") || "",
          agentPreview.allowed_tools.join("\n"),
        ].join("\n"),
        contextWindowTokens: agentPreview.model_meta?.context_window_tokens ?? null,
        defaultOutputTokens: agentPreview.model_meta?.default_output_tokens ?? null,
        modelId: agentPreview.model,
      });

      return (
        <div className="space-y-4">
          <PreviewCard title={agentPreview.name} subtitle={`${agentPreview.role} · ${agentPreview.model_meta?.display_name || agentPreview.model || "Unassigned model"}`}>
            <div className="flex flex-wrap gap-2">
              <StatusBadge>{agentPreview.is_active ? "active" : "inactive"}</StatusBadge>
              <StatusBadge>{agentPreview.agent_id}</StatusBadge>
              <ContextIndicatorPill
                usedTokens={estimate.estimatedUsedTokens}
                windowTokens={estimate.contextWindowTokens}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{agentPreview.purpose}</p>
          </PreviewCard>

          <PreviewCard title="Permissions + Context" subtitle="Preview mode">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Allowed Tools</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {agentPreview.allowed_tools.length > 0 ? agentPreview.allowed_tools.map((tool) => (
                    <StatusBadge key={tool}>{tool}</StatusBadge>
                  )) : <span className="text-sm text-muted-foreground">No tools allowed.</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Recent Task Domains</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {agentPreview.recent_task_domains.length > 0 ? agentPreview.recent_task_domains.map((domain) => (
                    <StatusBadge key={domain}>{domain}</StatusBadge>
                  )) : <span className="text-sm text-muted-foreground">No recent domains yet.</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Context Window</div>
                <div className="mt-3 text-sm text-foreground">
                  {estimate.contextWindowTokens.toLocaleString()} tokens
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Default Loaded Estimate</div>
                <div className="mt-3 text-sm text-foreground">
                  {estimate.estimatedUsedTokens.toLocaleString()} used · {estimate.defaultOutputTokens.toLocaleString()} reserved output
                </div>
              </div>
            </div>
          </PreviewCard>

          <PreviewCard title="Prompt File" subtitle={agentPreview.prompt_path}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                This is the canonical prompt file used by the runtime. It is the only editable file surface here.
              </p>
              <Button
                size="sm"
                onClick={async () => {
                  setSavingPrompt(true);
                  try {
                    await saveAgentPromptFile(agentPreview.agent_id, agentDraftPrompt);
                    toast({ title: "Prompt file saved" });
                  } catch (error) {
                    toast({
                      title: "Could not save prompt file",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  } finally {
                    setSavingPrompt(false);
                  }
                }}
                disabled={savingPrompt || agentDraftPrompt === agentPreview.prompt_content}
              >
                {savingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Prompt
              </Button>
            </div>

            <Textarea
              value={agentDraftPrompt}
              onChange={(event) => setAgentDraftPrompt(event.target.value)}
              className="mt-4 min-h-[420px] resize-y border-border/70 bg-background/80 font-mono text-xs leading-relaxed"
            />
          </PreviewCard>
        </div>
      );
    }

    if (selection.kind === "tool") {
      const tool = runtimeToolDefinitions.find((entry) => entry.name === selection.toolName) || null;
      if (!tool) return null;

      const agentsWithTool = Object.entries(policies)
        .filter(([, toolNames]) => toolNames.includes(tool.name))
        .map(([agentId]) => agents.find((agent) => agent.agent_id === agentId)?.name || agentId);

      return (
        <div className="space-y-4">
          <PreviewCard title={tool.name} subtitle={tool.sourcePath}>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
          </PreviewCard>
          <PreviewCard title="Allowed For Agents" subtitle="Read-only from the current policy snapshot">
            <div className="flex flex-wrap gap-2">
              {agentsWithTool.length > 0 ? agentsWithTool.map((agentName) => (
                <StatusBadge key={agentName}>{agentName}</StatusBadge>
              )) : <span className="text-sm text-muted-foreground">No agents currently allow this tool.</span>}
            </div>
          </PreviewCard>
          <PreviewCard title="Runtime Definition" subtitle="Read-only tool source">
            <pre className="overflow-auto rounded-2xl bg-background/80 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
              {tool.sourceCode}
            </pre>
          </PreviewCard>
        </div>
      );
    }

    if (selection.kind === "knowledge") {
      const file = knowledgeFiles.find((entry) => entry.file_id === selection.fileId) || null;
      if (!file) return null;
      return (
        <div className="space-y-4">
          <PreviewCard title={file.title} subtitle={file.file_path}>
            <div className="flex flex-wrap gap-2">
              <StatusBadge>{file.domain}</StatusBadge>
              {file.subdomain ? <StatusBadge>{file.subdomain}</StatusBadge> : null}
            </div>
            <div className="prose prose-sm mt-4 max-w-none dark:prose-invert">
              <ReactMarkdown>{file.content}</ReactMarkdown>
            </div>
          </PreviewCard>
        </div>
      );
    }

    if (selection.kind === "workspace-file" && workspaceFilePreview) {
      return (
        <div className="space-y-4">
          <PreviewCard title={workspaceFilePreview.name} subtitle={workspaceFilePreview.path}>
            <div className="mb-4 flex flex-wrap gap-2">
              <StatusBadge>read-only</StatusBadge>
              <StatusBadge>{workspaceFilePreview.size} bytes</StatusBadge>
              {workspaceFilePreview.modifiedAt ? <StatusBadge>{new Date(workspaceFilePreview.modifiedAt).toLocaleString()}</StatusBadge> : null}
            </div>
            <pre className="overflow-auto whitespace-pre-wrap rounded-2xl bg-background/80 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
              {workspaceFilePreview.content}
            </pre>
          </PreviewCard>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <PreviewCard title={branchLabel(currentBranch)} subtitle={currentBranch === "computer" ? computerRootLabel : workspaceRoot}>
          <p className="text-sm text-muted-foreground">
            Select an item from the list to inspect it. Computer and app code files are preview-only here. Prompt editing is limited to the Agents branch.
          </p>
        </PreviewCard>
      </div>
    );
  })();

  if (loading) {
    return (
      <div className="flex min-h-[480px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ExplorerBrowserLayout
      rootLabel="Files"
      breadcrumbs={breadcrumbs}
      onSelectPath={(path) => {
        if (!path) {
          setSelection({ kind: "root", branch: null });
          return;
        }

        const [branch, ...rest] = path.split("/");
        const nextBranch = branch as BranchId;
        if (nextBranch === "computer" || nextBranch === "runs" || nextBranch === "learning") {
          const relativePath = rest.join("/");
          setWorkspacePaths((current) => ({ ...current, [nextBranch]: relativePath }));
          setSelection({ kind: "branch", branch: nextBranch });
          return;
        }

        setSelection({ kind: "branch", branch: nextBranch });
      }}
      toolbar={(
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${currentBranch || "files"}...`}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}
      list={listPane}
      preview={previewPane}
    />
  );
}

function branchLabel(branch: BranchId) {
  const branchDef = ROOT_BRANCHES.find((entry) => entry.id === branch);
  return branchDef?.title || branch;
}

function PreviewCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card/80 p-5 shadow-[0_20px_80px_-40px_hsl(var(--foreground)/0.2)]">
      <div className="mb-4">
        <div className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">{subtitle}</div>
        <h3 className="mt-1 font-display text-xl font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
      <Shield className="h-3 w-3" />
      {children}
    </span>
  );
}
