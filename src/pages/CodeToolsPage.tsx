import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  FileCode2,
  FileText,
  Folder,
  HardDriveDownload,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ExplorerBrowserLayout, type ExplorerPathCrumb } from "@/components/explorer/ExplorerBrowserLayout";
import { ExplorerListItem } from "@/components/explorer/ExplorerListItem";
import { useRegisterSidebarExplorer } from "@/components/explorer/SidebarExplorer";
import { useToast } from "@/hooks/use-toast";
import {
  buildFolderDocs,
  catalogFromAgents,
  codeToolAgentSeeds,
  folderNameFromPath,
  normalizeFolderPath,
  parentFolderPath,
  type CodeToolCatalogRow,
  type CodeToolFolderDocRow,
  type ToolAgent,
} from "@/lib/code-tools";
import { runtimeToolDefinitionsByName } from "@/lib/runtime-tools";

type Agent = ToolAgent & {
  id: string;
};

type Selection =
  | { kind: "readme"; path: string }
  | { kind: "tool"; agent_id: string };

type PolicyRow = {
  agent_id: string;
  allowed_tools: string[] | null;
};

async function seedCodeTools(existing: Agent[]) {
  const existingIds = new Set(existing.map((agent) => agent.agent_id));
  const missing = codeToolAgentSeeds.filter((seed) => !existingIds.has(seed.agent_id));
  if (missing.length === 0) return false;

  const { error } = await supabase.from("agents").insert(
    missing.map((seed) => ({
      agent_id: seed.agent_id,
      name: seed.name,
      role: seed.role,
      purpose: seed.purpose,
      is_active: seed.is_active,
      capability_tags: seed.capability_tags || [],
      model: seed.model,
      instructions_md: seed.instructions_md,
    })),
  );

  return !error;
}

function sortFolderDocs(left: CodeToolFolderDocRow, right: CodeToolFolderDocRow) {
  const depthDiff = left.depth - right.depth;
  if (depthDiff !== 0) return depthDiff;
  return left.folder_path.localeCompare(right.folder_path);
}

function folderChain(path: string) {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

export default function CodeToolsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [catalog, setCatalog] = useState<CodeToolCatalogRow[]>([]);
  const [folderDocs, setFolderDocs] = useState<CodeToolFolderDocRow[]>([]);
  const [policies, setPolicies] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "readme", path: "" });
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data } = await supabase
        .from("agents")
        .select("id, agent_id, name, role, purpose, is_active, capability_tags, model, instructions_md")
        .order("created_at", { ascending: true });

      let nextAgents = (data as Agent[]) || [];
      const seeded = await seedCodeTools(nextAgents);
      if (seeded) {
        const { data: refreshed } = await supabase
          .from("agents")
          .select("id, agent_id, name, role, purpose, is_active, capability_tags, model, instructions_md")
          .order("created_at", { ascending: true });
        nextAgents = (refreshed as Agent[]) || [];
      }

      setAgents(nextAgents);

      const fallbackCatalog = catalogFromAgents(nextAgents);
      const fallbackDocs = buildFolderDocs(fallbackCatalog);

      const { data: catalogRows, error: catalogError } = await supabase
        .from("code_tool_catalog")
        .select("*")
        .order("folder_path", { ascending: true })
        .order("sort_order", { ascending: true });

      const { data: docRows, error: docsError } = await supabase
        .from("code_tool_folder_docs")
        .select("*")
        .order("depth", { ascending: true })
        .order("folder_path", { ascending: true });

      const { data: policyRows } = await supabase
        .from("agent_policies")
        .select("agent_id, allowed_tools");

      if (!catalogError && !docsError && catalogRows && docRows && catalogRows.length > 0 && docRows.length > 0) {
        setCatalog((catalogRows as CodeToolCatalogRow[]) || []);
        setFolderDocs(((docRows as CodeToolFolderDocRow[]) || []).sort(sortFolderDocs));
      } else {
        setCatalog(fallbackCatalog);
        setFolderDocs(fallbackDocs);
      }

      setPolicies(
        Object.fromEntries(
          ((policyRows as PolicyRow[]) || []).map((policy) => [policy.agent_id, policy.allowed_tools || []]),
        ),
      );

      setCurrentPath("");
      setExpandedPaths([]);
      setSelection({ kind: "readme", path: "" });
      setLoading(false);
    };

    load();
  }, []);

  const currentDoc = folderDocs.find((doc) => doc.folder_path === currentPath) || null;
  const childFolders = folderDocs.filter((doc) => doc.parent_path === currentPath);
  const toolsInFolder = catalog.filter((entry) => normalizeFolderPath(entry.folder_path) === currentPath);
  const selectedTool = selection.kind === "tool" ? catalog.find((entry) => entry.agent_id === selection.agent_id) || null : null;
  const selectedToolAgent = selection.kind === "tool" ? agents.find((agent) => agent.agent_id === selection.agent_id) || null : null;
  const selectedDoc =
    selection.kind === "readme"
      ? folderDocs.find((doc) => doc.folder_path === selection.path) || currentDoc
      : currentDoc;
  const sortedFolderDocs = useMemo(() => [...folderDocs].sort(sortFolderDocs), [folderDocs]);
  const breadcrumbs = useMemo(() => (currentPath ? currentPath.split("/").filter(Boolean) : []), [currentPath]);
  const pathCrumbs = useMemo<ExplorerPathCrumb[]>(
    () =>
      breadcrumbs.map((crumb, index) => ({
        label: folderNameFromPath(crumb),
        path: breadcrumbs.slice(0, index + 1).join("/"),
      })),
    [breadcrumbs],
  );
  const ensureExpandedPath = useCallback((path: string) => {
    if (!path) return;

    const chain = folderChain(path);
    setExpandedPaths((currentPaths) => Array.from(new Set([...currentPaths, ...chain])));
  }, []);
  const handlePathSelect = useCallback((path: string) => {
    setCurrentPath(path);
    setSelection({ kind: "readme", path });
    ensureExpandedPath(path);
  }, [ensureExpandedPath]);
  const handleToolSelect = useCallback(
    (agentId: string) => {
      const tool = catalog.find((entry) => entry.agent_id === agentId);
      if (!tool) return;

      const path = normalizeFolderPath(tool.folder_path);
      setCurrentPath(path);
      setSelection({ kind: "tool", agent_id: agentId });
      ensureExpandedPath(path);
    },
    [catalog, ensureExpandedPath],
  );
  const handleSidebarToggle = useCallback((path: string, nextExpanded: boolean) => {
    setExpandedPaths((currentPaths) => {
      if (nextExpanded) {
        return Array.from(new Set([...currentPaths, ...folderChain(path)]));
      }

      return currentPaths.filter((candidate) => candidate !== path && !candidate.startsWith(`${path}/`));
    });
  }, []);
  const handleSidebarCollapse = useCallback(() => {
    setExpandedPaths([]);
  }, []);
  const sidebarFolders = useMemo(
    () =>
      sortedFolderDocs
        .filter((doc) => doc.folder_path !== "")
        .map((doc) => ({
        path: doc.folder_path,
        name: doc.folder_name,
        parentPath: doc.parent_path,
        depth: doc.depth,
      })),
    [sortedFolderDocs],
  );
  const sidebarExplorer = useMemo(
    () => ({
      title: "Tools Explorer",
      rootLabel: "Tools",
      route: "/tools",
      folders: sidebarFolders,
      files: catalog.map((entry) => ({
        id: entry.agent_id,
        name: entry.tool_name,
        parentPath: normalizeFolderPath(entry.folder_path),
      })),
      selectedFileId: selection.kind === "tool" ? selection.agent_id : null,
      onSelectFile: handleToolSelect,
      expandedPaths,
      currentPath,
      onSelectPath: handlePathSelect,
      onTogglePath: handleSidebarToggle,
      onCollapse: handleSidebarCollapse,
      emptyStateLabel: "No tool folders yet.",
    }),
    [catalog, currentPath, expandedPaths, handlePathSelect, handleSidebarCollapse, handleSidebarToggle, handleToolSelect, selection, sidebarFolders],
  );

  useRegisterSidebarExplorer(sidebarExplorer);

  const handleAgentUpdated = (updatedAgent: Agent) => {
    setAgents((currentAgents) =>
      currentAgents.map((agent) => (agent.id === updatedAgent.id ? updatedAgent : agent)),
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <HardDriveDownload className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <ExplorerBrowserLayout
        rootLabel="Tools"
        breadcrumbs={pathCrumbs}
        onSelectPath={handlePathSelect}
        list={
          <div className="space-y-1">
            {childFolders.map((folder) => (
              <ExplorerListItem
                key={folder.folder_path}
                icon={<Folder className="h-4 w-4 text-primary" />}
                title={folder.folder_name}
                subtitle={`${folder.tool_count} tools`}
                kindLabel="Folder"
                onClick={() => handlePathSelect(folder.folder_path)}
              />
            ))}

            {toolsInFolder.map((tool) => (
              <ExplorerListItem
                key={tool.agent_id}
                icon={<FileCode2 className="h-4 w-4 text-info" />}
                title={tool.tool_name}
                subtitle={tool.execution_mode === "hybrid" ? "hybrid runtime tool" : "deterministic runtime tool"}
                kindLabel="Tool"
                selected={selection.kind === "tool" && selection.agent_id === tool.agent_id}
                onClick={() => handleToolSelect(tool.agent_id)}
              />
            ))}

            {currentDoc && (
              <ExplorerListItem
                icon={<FileText className="h-4 w-4 text-accent" />}
                title="README"
                subtitle="Folder guide"
                kindLabel="Readme"
                selected={selection.kind === "readme" && selection.path === currentPath}
                onClick={() => setSelection({ kind: "readme", path: currentPath })}
              />
            )}

            {childFolders.length === 0 && toolsInFolder.length === 0 && !currentDoc && (
              <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">This folder is empty.</div>
            )}
          </div>
        }
        preview={
          selection.kind === "tool" && selectedTool && selectedToolAgent ? (
            <ToolInspector
              entry={selectedTool}
              agent={selectedToolAgent}
              callableTools={policies[selectedToolAgent.agent_id] || []}
              onAgentUpdated={handleAgentUpdated}
              onSaveError={(message) => {
                toast({ title: "Could not save tool text", description: message, variant: "destructive" });
              }}
              onSaveSuccess={() => {
                toast({ title: "Tool text saved" });
              }}
            />
          ) : selectedDoc ? (
            <ReadmeInspector doc={selectedDoc} />
          ) : (
            <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">Select a file to preview it.</div>
          )
        }
      />
    </div>
  );
}

function ReadmeInspector({ doc }: { doc: CodeToolFolderDocRow }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileText className="h-4 w-4 text-accent" />
          README.md
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{doc.readme_title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {doc.child_folder_count} child folder{doc.child_folder_count === 1 ? "" : "s"} and {doc.tool_count} tool
          {doc.tool_count === 1 ? "" : "s"} indexed here.
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
        <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground">
          <ReactMarkdown>{doc.readme_content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function ToolInspector({
  entry,
  agent,
  callableTools,
  onAgentUpdated,
  onSaveSuccess,
  onSaveError,
}: {
  entry: CodeToolCatalogRow;
  agent: Agent;
  callableTools: string[];
  onAgentUpdated: (agent: Agent) => void;
  onSaveSuccess: () => void;
  onSaveError: (message: string) => void;
}) {
  const tags = agent.capability_tags || [];
  const parentPath = parentFolderPath(entry.folder_path);
  const callableToolDefinitions = callableTools
    .map((toolName) => runtimeToolDefinitionsByName[toolName])
    .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));
  const [draftInstructions, setDraftInstructions] = useState(agent.instructions_md || "");
  const [saving, setSaving] = useState(false);
  const isDirty = draftInstructions !== (agent.instructions_md || "");

  useEffect(() => {
    setDraftInstructions(agent.instructions_md || "");
  }, [agent.id, agent.instructions_md]);

  const saveInstructions = async () => {
    setSaving(true);

    const { error } = await supabase
      .from("agents")
      .update({ instructions_md: draftInstructions || null })
      .eq("id", agent.id);

    setSaving(false);

    if (error) {
      onSaveError(error.message);
      return;
    }

    onAgentUpdated({
      ...agent,
      instructions_md: draftInstructions || null,
    });
    onSaveSuccess();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileCode2 className="h-4 w-4 text-info" />
          Tool File
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{entry.tool_name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{entry.execution_mode}</Badge>
          <Badge>{agent.is_active ? "active" : "inactive"}</Badge>
          <Badge>{entry.agent_id}</Badge>
          <Badge>{parentPath === null ? "/" : `/${parentPath}`}</Badge>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Capability Tags
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <div className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Callable Tools</div>
        {callableTools.length > 0 ? (
          <div className="space-y-2 rounded-xl bg-background/70 p-4 font-mono text-xs leading-relaxed text-foreground">
            {callableTools.map((toolName) => (
              <div key={toolName}>{toolName}</div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-xs text-muted-foreground">
            No callable tools are configured for this agent in <code>agent_policies.allowed_tools</code>.
          </div>
        )}
      </div>

      {callableToolDefinitions.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
          <div className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Runtime Tool Source</div>
          <div className="space-y-4">
            {callableToolDefinitions.map((tool) => (
              <div key={tool.name} className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs text-foreground">{tool.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{tool.description}</div>
                  </div>
                  <div className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-mono text-muted-foreground">
                    {tool.sourcePath}
                  </div>
                </div>

                <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl bg-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                  {tool.sourceCode}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Raw Tool Text</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This is the exact <code>instructions_md</code> text stored for the tool and passed into the runtime agent.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDraftInstructions(agent.instructions_md || "")} disabled={!isDirty || saving}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button type="button" size="sm" onClick={saveInstructions} disabled={!isDirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Text
            </Button>
          </div>
        </div>

        <label htmlFor={`tool-text-${agent.id}`} className="sr-only">
          Raw tool instructions
        </label>
        <Textarea
          id={`tool-text-${agent.id}`}
          value={draftInstructions}
          onChange={(event) => setDraftInstructions(event.target.value)}
          placeholder="No tool text saved yet. Write the exact instructions you want this runtime tool to receive."
          className="min-h-[340px] resize-y border-border/70 bg-background/80 font-mono text-xs leading-relaxed"
        />

        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-mono text-muted-foreground">
          <span>{draftInstructions.length} chars</span>
          <span>{isDirty ? "unsaved changes" : "saved"}</span>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border/70 bg-secondary px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
      {children}
    </span>
  );
}
