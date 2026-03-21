import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  FileCode2,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pin,
  PinOff,
  Save,
  Search,
  Shield,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentPreviewSummary } from "@/components/agents/AgentPreviewSummary";
import { SmartPath } from "@/components/path/SmartPath";
import { useToast } from "@/hooks/use-toast";
import { buildContextEstimate } from "@/lib/context-indicator";
import {
  FILES_QUICK_ACCESS_UPDATED_EVENT,
  getNextPinnedFolders,
  readPinnedFolders,
  writePinnedFolders,
} from "@/lib/files-quick-access";
import {
  getLocalFileInfo,
  listLocalFiles,
  readLocalFile,
  writeLocalFile,
  type LocalFileEntry,
  type LocalFileInfo,
  type LocalFilePreview,
} from "@/lib/local-file-service";
import { joinFsPath, normalizeFsPath, normalizeFsPathForCompare, parentFsPath } from "@/lib/path-utils";
import {
  exportWorkspaceBranchFiles,
  readAgentPromptPreview,
  saveAgentPromptFile,
  type AgentPromptPreview,
} from "@/lib/workspace-files";
import { cn } from "@/lib/utils";

type AgentRow = {
  agent_id: string;
  name: string;
  role: string;
  purpose: string;
  is_active: boolean;
  model: string | null;
  instructions_md?: string | null;
  model_display_name?: string | null;
  context_window_tokens?: number | null;
  default_output_tokens?: number | null;
  prompt_path?: string;
};

type ModelRow = {
  model_id: string;
  display_name: string;
  context_window_tokens: number | null;
  default_output_tokens: number | null;
};

type SortMode = "name" | "modified" | "created";

const COMPUTER_TITLE = "Computer";

export default function FilesPage() {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [info, setInfo] = useState<LocalFileInfo | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LocalFileEntry | null>(null);
  const [filePreview, setFilePreview] = useState<LocalFilePreview | null>(null);
  const [agentPreview, setAgentPreview] = useState<AgentPromptPreview | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [selectedModelDraft, setSelectedModelDraft] = useState("");
  const [savingModel, setSavingModel] = useState(false);
  const [pinnedFolders, setPinnedFolders] = useState<string[]>(() => readPinnedFolders());
  const requestedPath = new URLSearchParams(location.search).get("path");

  const openPath = useCallback((nextPath: string) => {
    if (!nextPath) return;
    setSelectedEntry(null);
    setCurrentPath(nextPath);

    const params = new URLSearchParams(location.search);
    params.set("path", nextPath);
    navigate({ pathname: "/files", search: `?${params.toString()}` }, { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      try {
        const [fileInfo, agentResult, modelResult] = await Promise.all([
          getLocalFileInfo(),
          supabase
            .from("agents")
            .select("agent_id, name, role, purpose, is_active, model, instructions_md")
            .order("role", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("model_registry")
            .select("model_id, display_name, context_window_tokens, default_output_tokens")
            .eq("is_active", true),
        ]);

        if (agentResult.error) throw agentResult.error;
        if (modelResult.error) throw modelResult.error;

        const modelsById = new Map(((modelResult.data as ModelRow[]) || []).map((row) => [row.model_id, row]));
        const nextAgents = ((agentResult.data as AgentRow[]) || []).map((agent) => {
          const model = agent.model ? modelsById.get(agent.model) : null;
          return {
            ...agent,
            model_display_name: model?.display_name || null,
            context_window_tokens: model?.context_window_tokens ?? null,
            default_output_tokens: model?.default_output_tokens ?? null,
            prompt_path: joinFsPath(fileInfo.clawDataRoot, "agents", `${agent.agent_id}.md`),
          };
        });

        setInfo(fileInfo);
        setAgents(nextAgents);
        setModels((modelResult.data as ModelRow[]) || []);
      } catch (error) {
        toast({
          title: "Files could not load",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadInitial();
  }, [toast]);

  useEffect(() => {
    const syncPinnedFolders = () => setPinnedFolders(readPinnedFolders());
    window.addEventListener(FILES_QUICK_ACCESS_UPDATED_EVENT, syncPinnedFolders);
    window.addEventListener("storage", syncPinnedFolders);
    return () => {
      window.removeEventListener(FILES_QUICK_ACCESS_UPDATED_EVENT, syncPinnedFolders);
      window.removeEventListener("storage", syncPinnedFolders);
    };
  }, []);

  useEffect(() => {
    if (!info) return;
    const nextPath = requestedPath || info.defaultPath;
    setSelectedEntry(null);
    setCurrentPath((current) => {
      if (normalizeFsPathForCompare(nextPath) === normalizeFsPathForCompare(current || "")) {
        return current;
      }
      return nextPath;
    });
  }, [info, requestedPath]);

  useEffect(() => {
    if (!currentPath) return;

    const loadEntries = async () => {
      setEntriesLoading(true);
      try {
        if (info) {
          const agentsRoot = joinFsPath(info.clawDataRoot, "agents");
          const knowledgeRoot = joinFsPath(info.clawDataRoot, "knowledge");
          const runsRoot = joinFsPath(info.clawDataRoot, "runs");
          const learningReportsRoot = joinFsPath(info.clawDataRoot, "learning", "reports");

          if (isWithinFsRoot(currentPath, agentsRoot)) {
            await Promise.all(
              agents.map(async (agent) => {
                const promptPath = joinFsPath(info.clawDataRoot, "agents", `${agent.agent_id}.md`);
                const promptContent = agent.instructions_md || `# ${agent.name}\n`;
                await writeLocalFile(promptPath, promptContent, { allowMirrorWrite: true });
              }),
            );
          }

          if (isWithinFsRoot(currentPath, knowledgeRoot)) {
            const { data: knowledgeFiles, error } = await supabase
              .from("knowledge_files")
              .select("file_path, content")
              .order("file_path", { ascending: true });

            if (error) throw error;

            await Promise.all(
              ((knowledgeFiles as Array<{ file_path: string; content: string }> | null) || []).map((file) =>
                writeLocalFile(joinFsPath(info.clawDataRoot, file.file_path), file.content, { allowMirrorWrite: true }),
              ),
            );
          }

          if (isWithinFsRoot(currentPath, runsRoot)) {
            const { files } = await exportWorkspaceBranchFiles("runs");
            await Promise.all(
              files.map((file) =>
                writeLocalFile(joinFsPath(runsRoot, file.path), file.content, { allowMirrorWrite: true }),
              ),
            );
          }

          if (isWithinFsRoot(currentPath, learningReportsRoot)) {
            const { files } = await exportWorkspaceBranchFiles("learning");
            await Promise.all(
              files.map((file) =>
                writeLocalFile(joinFsPath(learningReportsRoot, file.path), file.content, { allowMirrorWrite: true }),
              ),
            );
          }
        }

        const { entries: nextEntries } = await listLocalFiles(currentPath);
        setEntries(nextEntries);

        if (selectedEntry) {
          const refreshedSelection = nextEntries.find((entry) => entry.path === selectedEntry.path) || null;
          setSelectedEntry(refreshedSelection);
        }
      } catch (error) {
        toast({
          title: "Could not load this folder",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setEntriesLoading(false);
      }
    };

    void loadEntries();
  }, [agents, currentPath, info, toast]);

  useEffect(() => {
    if (!selectedEntry || selectedEntry.kind !== "file") {
      setFilePreview(null);
      setAgentPreview(null);
      setPromptDraft("");
      setSelectedModelDraft("");
      return;
    }

    const matchingAgent = findAgentByPath(agents, selectedEntry.path);

    const loadPreview = async () => {
      try {
        const [{ file }, agentData] = await Promise.all([
          readLocalFile(selectedEntry.path),
          matchingAgent ? readAgentPromptPreview(matchingAgent.agent_id) : Promise.resolve(null),
        ]);
        setFilePreview(file);
        setPromptDraft(file.content);
        setAgentPreview(agentData?.agent || null);
        setSelectedModelDraft(agentData?.agent?.model || "");
      } catch (error) {
        toast({
          title: "Could not preview file",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

    void loadPreview();
  }, [agents, selectedEntry, toast]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const scopedEntries = normalizedQuery
      ? entries.filter((entry) => entry.name.toLowerCase().includes(normalizedQuery))
      : entries;
    return sortEntries(scopedEntries, sortMode);
  }, [entries, query, sortMode]);

  const activeAgent = useMemo(
    () => (selectedEntry?.kind === "file" ? findAgentByPath(agents, selectedEntry.path) : null),
    [agents, selectedEntry],
  );

  const activeKnowledgeFilePath = useMemo(
    () => (info && selectedEntry?.kind === "file" ? getKnowledgeWorkspacePath(info.clawDataRoot, selectedEntry.path) : null),
    [info, selectedEntry],
  );

  const contextEstimate = useMemo(() => {
    if (!agentPreview) return null;
    return buildContextEstimate({
      promptContent: promptDraft,
      agentContextContent: [
        agentPreview.allowed_tools.join("\n"),
        agentPreview.recent_task_domains.join("\n"),
      ].filter(Boolean).join("\n"),
      contextWindowTokens: agentPreview.model_meta?.context_window_tokens ?? null,
      defaultOutputTokens: agentPreview.model_meta?.default_output_tokens ?? null,
      modelId: agentPreview.model,
    });
  }, [agentPreview, promptDraft]);

  const currentFolderPinned = useMemo(
    () => pinnedFolders.some((folder) => normalizeFsPathForCompare(folder) === normalizeFsPathForCompare(currentPath)),
    [currentPath, pinnedFolders],
  );

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-44px)] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-44px)] overflow-hidden p-6">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 shadow-[0_20px_80px_-40px_hsl(var(--foreground)/0.22)]">
        <div className="flex items-center gap-3 border-b border-border/70 p-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (!info) return;
              openPath(parentFsPath(currentPath, info.computerRootPath));
            }}
            className="rounded-2xl"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
            {currentPath === info?.computerRootPath ? (
              <span className="text-sm font-medium text-foreground">{COMPUTER_TITLE}</span>
            ) : (
              <SmartPath
                path={currentPath}
                className="w-full"
                segmentClassName="text-sm font-medium text-foreground"
                onNavigate={openPath}
              />
            )}
          </div>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-2xl">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[22rem] rounded-2xl border border-border/70 p-3">
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const nextFolders = getNextPinnedFolders(pinnedFolders, currentPath);
                    setPinnedFolders(nextFolders);
                    writePinnedFolders(nextFolders);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
                >
                  <div className="pr-3">
                    <div className="text-sm font-medium text-foreground">
                      {currentFolderPinned ? "Unpin current folder" : "Pin current folder"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Show or hide this folder in the Files quick access section in the main sidebar.
                    </div>
                  </div>
                  {currentFolderPinned ? <PinOff className="h-4 w-4 text-muted-foreground" /> : <Pin className="h-4 w-4 text-muted-foreground" />}
                </button>

                <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                    <Search className="h-3.5 w-3.5" />
                    Search this folder
                  </div>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter current folder"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <section
            className={cn(
              "min-h-0 flex-1 border-b border-border/70 transition-[width,flex-basis] duration-300 ease-out xl:border-b-0 xl:border-r",
              previewExpanded ? "xl:basis-[calc(100%-54rem)]" : "xl:basis-[calc(100%-32rem)]",
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                <div className="text-sm text-muted-foreground">
                  {filteredEntries.length} item{filteredEntries.length === 1 ? "" : "s"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Sort</span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none"
                  >
                    <option value="name">Filename</option>
                    <option value="modified">Last updated</option>
                    <option value="created">Creation date</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_9rem] border-b border-border/70 bg-background/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                <div>Name</div>
                <div>Last Updated</div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {entriesLoading ? (
                  <div className="flex min-h-[320px] items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    {query ? "No files match this search." : "No files in this location."}
                  </div>
                ) : (
                  <div>
                    {filteredEntries.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => {
                          if (entry.kind === "directory") {
                            openPath(entry.path);
                            return;
                          }
                          setSelectedEntry(entry);
                        }}
                        className={cn(
                          "grid w-full grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
                          selectedEntry?.path === entry.path && "bg-primary/8",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
                            {entry.kind === "directory" ? <FolderOpen className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{entry.name}</div>
                            {entry.isEditable ? (
                              <div className="text-xs text-emerald-600 dark:text-emerald-400">
                                {getEditableFileLabel(entry.path, info?.clawDataRoot)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatListDate(entry.modifiedAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside
            className={cn(
              "min-h-0 bg-background/20 transition-[width] duration-300 ease-out xl:w-[32rem]",
              previewExpanded && "xl:w-[54rem]",
            )}
            onMouseEnter={() => setPreviewExpanded(true)}
            onMouseLeave={() => setPreviewExpanded(false)}
          >
            <div className="h-full overflow-auto p-4 xl:p-5">
              <FilesPreviewPane
                selectedEntry={selectedEntry}
                filePreview={filePreview}
                agentPreview={agentPreview}
                promptDraft={promptDraft}
                setPromptDraft={setPromptDraft}
                savingPrompt={savingPrompt}
                selectedModelDraft={selectedModelDraft}
                setSelectedModelDraft={setSelectedModelDraft}
                availableModels={models}
                savingModel={savingModel}
                contextEstimate={contextEstimate}
                activeAgent={activeAgent}
                activeKnowledgeFilePath={activeKnowledgeFilePath}
                onSavePrompt={async () => {
                  if (!selectedEntry) return;
                  setSavingPrompt(true);
                  try {
                    await writeLocalFile(selectedEntry.path, promptDraft);
                    if (activeAgent) {
                      await saveAgentPromptFile(activeAgent.agent_id, promptDraft);
                    } else if (activeKnowledgeFilePath) {
                      const { error } = await supabase
                        .from("knowledge_files")
                        .update({
                          content: promptDraft,
                          title: extractMarkdownTitle(promptDraft, stripMarkdownExtension(selectedEntry.name)),
                          word_count: countWords(promptDraft),
                          updated_at: new Date().toISOString(),
                        })
                        .eq("file_path", activeKnowledgeFilePath);

                      if (error) throw error;
                    }
                    const { file } = await readLocalFile(selectedEntry.path);
                    setFilePreview(file);
                    toast({
                      title: activeAgent
                        ? "Prompt file saved"
                        : activeKnowledgeFilePath
                          ? "Knowledge file saved"
                          : "File saved",
                    });
                  } catch (error) {
                    toast({
                      title: activeAgent
                        ? "Could not save prompt file"
                        : activeKnowledgeFilePath
                          ? "Could not save knowledge file"
                          : "Could not save file",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  } finally {
                    setSavingPrompt(false);
                  }
                }}
                onSaveModel={async () => {
                  if (!activeAgent) return;
                  setSavingModel(true);
                  try {
                    const nextModel = selectedModelDraft || null;
                    const { error } = await supabase
                      .from("agents")
                      .update({ model: nextModel })
                      .eq("agent_id", activeAgent.agent_id);

                    if (error) throw error;

                    setAgents((current) => current.map((agent) => {
                      if (agent.agent_id !== activeAgent.agent_id) return agent;
                      const nextMeta = models.find((model) => model.model_id === nextModel) || null;
                      return {
                        ...agent,
                        model: nextModel,
                        model_display_name: nextMeta?.display_name || null,
                        context_window_tokens: nextMeta?.context_window_tokens ?? null,
                        default_output_tokens: nextMeta?.default_output_tokens ?? null,
                      };
                    }));

                    const refreshed = await readAgentPromptPreview(activeAgent.agent_id);
                    setAgentPreview(refreshed.agent);
                    toast({ title: "Agent model updated" });
                  } catch (error) {
                    toast({
                      title: "Could not update model",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  } finally {
                    setSavingModel(false);
                  }
                }}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function FilesPreviewPane({
  selectedEntry,
  filePreview,
  agentPreview,
  promptDraft,
  setPromptDraft,
  savingPrompt,
  selectedModelDraft,
  setSelectedModelDraft,
  availableModels,
  savingModel,
  contextEstimate,
  activeAgent,
  activeKnowledgeFilePath,
  onSavePrompt,
  onSaveModel,
}: {
  selectedEntry: LocalFileEntry | null;
  filePreview: LocalFilePreview | null;
  agentPreview: AgentPromptPreview | null;
  promptDraft: string;
  setPromptDraft: (value: string) => void;
  savingPrompt: boolean;
  selectedModelDraft: string;
  setSelectedModelDraft: (value: string) => void;
  availableModels: ModelRow[];
  savingModel: boolean;
  contextEstimate: ReturnType<typeof buildContextEstimate> | null;
  activeAgent: AgentRow | null;
  activeKnowledgeFilePath: string | null;
  onSavePrompt: () => Promise<void>;
  onSaveModel: () => Promise<void>;
}) {
  const promptEditorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!promptEditorRef.current || !selectedEntry?.isEditable) return;
    promptEditorRef.current.style.height = "0px";
    promptEditorRef.current.style.height = `${promptEditorRef.current.scrollHeight}px`;
  }, [promptDraft, selectedEntry]);

  if (!selectedEntry) {
    return (
      <PreviewCard title="Files">
        <p className="text-sm text-muted-foreground">
          Select a file to preview it here. Folders are navigated from the main sidebar quick access and the file list. Agent prompt files stay editable, while system files and app code remain read-only.
        </p>
      </PreviewCard>
    );
  }

  if (!filePreview) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedEntry.isEditable && agentPreview && activeAgent && contextEstimate) {
    return (
      <PreviewCard title={agentPreview.name} className="flex flex-col">
        <AgentPreviewSummary
          agentPreview={agentPreview}
          contextEstimate={contextEstimate}
        />

        <div className="mt-5 rounded-2xl border border-border/70 bg-background/60 p-4">
          <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Model</div>
          <div className="flex items-center gap-3">
            <select
              value={selectedModelDraft}
              onChange={(event) => setSelectedModelDraft(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">No model</option>
              {availableModels.map((model) => (
                <option key={model.model_id} value={model.model_id}>
                  {model.display_name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onSaveModel()}
              disabled={savingModel || selectedModelDraft === (agentPreview.model || "")}
            >
              {savingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Model
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              This agent file is editable. System files and app code stay read-only.
            </p>
            <Button
              size="sm"
              onClick={() => void onSavePrompt()}
              disabled={savingPrompt || promptDraft === filePreview.content}
            >
              {savingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>

          <textarea
            ref={promptEditorRef}
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            className="mt-4 min-h-[24rem] w-full resize-none overflow-hidden rounded-2xl border border-border/70 bg-background/80 p-4 font-mono text-xs leading-relaxed text-foreground outline-none"
          />
        </div>
      </PreviewCard>
    );
  }

  if (selectedEntry.isEditable) {
    return (
      <PreviewCard title={filePreview.name} className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge>{activeKnowledgeFilePath ? "knowledge" : "editable"}</StatusBadge>
          {filePreview.createdAt ? <StatusBadge>Created {formatBadgeDate(filePreview.createdAt)}</StatusBadge> : null}
          {filePreview.modifiedAt ? <StatusBadge>Updated {formatBadgeDate(filePreview.modifiedAt)}</StatusBadge> : null}
          {typeof filePreview.size === "number" ? <StatusBadge>{filePreview.size} bytes</StatusBadge> : null}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {activeKnowledgeFilePath
                ? "This knowledge file is editable and syncs back into the long-term knowledge database."
                : "This file is editable."}
            </p>
            <Button
              size="sm"
              onClick={() => void onSavePrompt()}
              disabled={savingPrompt || promptDraft === filePreview.content}
            >
              {savingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>

          <textarea
            ref={promptEditorRef}
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            className="mt-4 min-h-[24rem] w-full resize-none overflow-hidden rounded-2xl border border-border/70 bg-background/80 p-4 font-mono text-xs leading-relaxed text-foreground outline-none"
          />
        </div>
      </PreviewCard>
    );
  }

  return (
    <PreviewCard title={filePreview.name}>
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge>{filePreview.isEditable ? "editable" : "read-only"}</StatusBadge>
        {filePreview.isProtected ? <StatusBadge>protected</StatusBadge> : null}
        {filePreview.createdAt ? <StatusBadge>Created {formatBadgeDate(filePreview.createdAt)}</StatusBadge> : null}
        {filePreview.modifiedAt ? <StatusBadge>Updated {formatBadgeDate(filePreview.modifiedAt)}</StatusBadge> : null}
        {typeof filePreview.size === "number" ? <StatusBadge>{filePreview.size} bytes</StatusBadge> : null}
      </div>

      {looksLikeMarkdown(filePreview.name) ? (
        <div className="prose prose-sm max-w-none rounded-2xl bg-background/80 p-4 dark:prose-invert">
          <ReactMarkdown>{filePreview.content}</ReactMarkdown>
        </div>
      ) : (
        <pre className="overflow-auto whitespace-pre-wrap rounded-2xl bg-background/80 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {filePreview.content}
        </pre>
      )}
    </PreviewCard>
  );
}

function PreviewCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl border border-border/70 bg-card/80 p-5 shadow-[0_20px_80px_-40px_hsl(var(--foreground)/0.2)]", className)}>
      <div className="mb-4 min-w-0">
        <h3 className="font-display text-xl font-semibold text-foreground">{title}</h3>
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

function sortEntries(entries: LocalFileEntry[], sortMode: SortMode) {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;

    if (sortMode === "name") {
      return left.name.localeCompare(right.name);
    }

    const leftTime = new Date((sortMode === "created" ? left.createdAt : left.modifiedAt) || 0).getTime();
    const rightTime = new Date((sortMode === "created" ? right.createdAt : right.modifiedAt) || 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.name.localeCompare(right.name);
  });
}

function findAgentByPath(agents: AgentRow[], selectedPath: string) {
  const normalizedPath = normalizeFsPathForCompare(selectedPath);
  return agents.find((agent) => normalizeFsPathForCompare(agent.prompt_path || "") === normalizedPath) || null;
}

function formatListDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBadgeDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function looksLikeMarkdown(fileName: string) {
  return /\.(md|mdx)$/i.test(fileName);
}

function isWithinFsRoot(targetPath: string, rootPath: string) {
  const normalizedTarget = normalizeFsPathForCompare(targetPath);
  const normalizedRoot = normalizeFsPathForCompare(rootPath);
  return normalizedTarget === normalizedRoot
    || normalizedTarget.startsWith(`${normalizedRoot}/`)
    || normalizedTarget.startsWith(`${normalizedRoot}\\`);
}

function getKnowledgeWorkspacePath(clawDataRoot: string, absolutePath: string) {
  const normalizedKnowledgeRoot = normalizeFsPath(joinFsPath(clawDataRoot, "knowledge"));
  const normalizedAbsolutePath = normalizeFsPath(absolutePath);
  const compareKnowledgeRoot = normalizeFsPathForCompare(normalizedKnowledgeRoot);
  const compareAbsolutePath = normalizeFsPathForCompare(normalizedAbsolutePath);

  if (compareAbsolutePath !== compareKnowledgeRoot && !compareAbsolutePath.startsWith(`${compareKnowledgeRoot}/`)) {
    return null;
  }

  const relativePath = normalizedAbsolutePath.slice(normalizedKnowledgeRoot.length).replace(/^\/+/, "");
  return relativePath ? `knowledge/${relativePath}` : "knowledge";
}

function getEditableFileLabel(filePath: string, clawDataRoot?: string | null) {
  if (!clawDataRoot) return "Editable file";
  return getKnowledgeWorkspacePath(clawDataRoot, filePath) ? "Editable knowledge file" : "Editable prompt file";
}

function stripMarkdownExtension(fileName: string) {
  return fileName.replace(/\.(md|mdx|txt)$/i, "");
}

function extractMarkdownTitle(content: string, fallback: string) {
  const headingMatch = content.match(/^\s*#\s+(.+?)\s*$/m);
  return headingMatch?.[1]?.trim() || fallback;
}

function countWords(content: string) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}
