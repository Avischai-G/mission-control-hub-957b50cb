import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCode2, FileText, Folder, Loader2, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AgentConfigModal } from "@/components/AgentConfigModal";
import { ExplorerBrowserLayout, type ExplorerPathCrumb } from "@/components/explorer/ExplorerBrowserLayout";
import { ExplorerListItem } from "@/components/explorer/ExplorerListItem";
import { useRegisterSidebarExplorer } from "@/components/explorer/SidebarExplorer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  agentFolderPickerHint,
  buildAgentTemplate,
  buildTemplateAgentPurpose,
  describeAgentFolder,
} from "@/lib/agent-utils";
import { codeToolAgentSeeds, isCodeToolAgent } from "@/lib/code-tools";
import { type ExplorerFolderDoc } from "@/lib/explorer-utils";

const runtimeSeeds = [
  {
    agent_id: "secretary",
    name: "Secretary",
    role: "core",
    purpose: "User-facing gateway. Handles normal chat and delegates build tasks.",
  },
  {
    agent_id: "orchestrator",
    name: "Orchestrator",
    role: "core",
    purpose: "Routes requests into chat, website, presentation, or cron flows.",
  },
  {
    agent_id: "universal-executor",
    name: "Universal Executor",
    role: "core",
    purpose: "Fallback operator for requests that do not fit a dedicated specialist. Researches and finds the best workable path to delivery.",
    capability_tags: ["fallback", "generalist", "research", "tool-use"],
    model: "claude-4.6-sonnet-20260217",
    instructions_md: `You are Universal Executor, the fallback operator for AI Mission Control.

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
- If the request needs local shell or filesystem execution that is not available, say that clearly and give the most useful next step.`,
  },
  {
    agent_id: "context-agent",
    name: "Context Agent",
    role: "infrastructure",
    purpose: "Selects the smallest useful knowledge packet for the active task.",
  },
  {
    agent_id: "website-brief-normalizer",
    name: "Website Brief Normalizer",
    role: "specialist",
    purpose: "Turns a raw website request into a strict structured brief.",
  },
  {
    agent_id: "website-html-builder",
    name: "Website HTML Builder",
    role: "specialist",
    purpose: "Builds the final standalone HTML website from an approved brief.",
  },
  {
    agent_id: "presentation-outline-planner",
    name: "Presentation Outline Planner",
    role: "specialist",
    purpose: "Turns a raw presentation request into a strict slide-by-slide outline.",
  },
  {
    agent_id: "presentation-slide-builder",
    name: "Presentation Slide Builder",
    role: "specialist",
    purpose: "Builds the final standalone HTML slide deck from an approved outline.",
  },
  {
    agent_id: "artifact-qa-reviewer",
    name: "Artifact QA Reviewer",
    role: "specialist",
    purpose: "Reviews generated websites and presentations for concrete defects.",
  },
  {
    agent_id: "cron-spec-extractor",
    name: "Cron Spec Extractor",
    role: "specialist",
    purpose: "Parses recurring-task requests into a runnable cron schedule and task prompt.",
  },
  {
    agent_id: "knowledge-curator",
    name: "Knowledge Curator",
    role: "specialist",
    purpose: "Maintains long-term knowledge during scheduled memory summarization.",
  },
  {
    agent_id: "night-report-summarizer",
    name: "Night Report Summarizer",
    role: "specialist",
    purpose: "Writes the concise operator summary for a nightly maintenance run.",
  },
];

const defaultAgentFolders = [
  { key: "core", name: "Core" },
  { key: "specialists", name: "Specialists" },
  { key: "infrastructure", name: "Infrastructure" },
] as const;

const protectedAgentIds = new Set([
  ...runtimeSeeds.map((seed) => seed.agent_id),
  ...codeToolAgentSeeds.map((seed) => seed.agent_id),
]);

type Agent = {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  purpose: string;
  is_active: boolean;
  capability_tags: string[] | null;
  model: string | null;
  group_id: string | null;
  identity_yaml: string | null;
  instructions_md: string | null;
};

type AgentGroup = {
  id: string;
  name: string;
  domain: string;
  leader_agent_id: string | null;
  max_children: number;
  parent_group_id: string | null;
};

type AgentFolderDoc = ExplorerFolderDoc;

type Selection =
  | { kind: "readme"; path: string }
  | { kind: "agent"; id: string };

function normalizeFolderName(name: string) {
  return name.trim().toLowerCase();
}

function shortAgentListName(name: string) {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function sortAgents(left: Agent, right: Agent) {
  return left.name.localeCompare(right.name);
}

function sortGroups(left: AgentGroup, right: AgentGroup) {
  return left.name.localeCompare(right.name);
}

function defaultFolderKeyForAgent(agent: Agent) {
  if (agent.role === "core") return "core";
  if (agent.role === "infrastructure") return "infrastructure";
  return "specialists";
}

function folderIdForAgent(agent: Agent, groupIds: Set<string>) {
  return agent.group_id && groupIds.has(agent.group_id) ? agent.group_id : "";
}

async function fetchAllAgents() {
  const { data } = await supabase.from("agents").select("*").order("created_at", { ascending: true });
  return (data as Agent[]) || [];
}

async function fetchAgentGroups() {
  const { data } = await supabase
    .from("agent_groups")
    .select("id, name, domain, leader_agent_id, max_children, parent_group_id")
    .eq("domain", "agents")
    .order("created_at", { ascending: true });

  return (data as AgentGroup[]) || [];
}

async function generateAgentId() {
  const { count } = await supabase.from("agents").select("*", { count: "exact", head: true });
  const nextNumber = (count || 0) + 1;
  return `agent${String(nextNumber).padStart(4, "0")}`;
}

async function seedRuntimeAgents(existing: Agent[]) {
  const existingIds = new Set(existing.map((agent) => agent.agent_id));
  const missing = runtimeSeeds.filter((seed) => !existingIds.has(seed.agent_id));
  if (missing.length === 0) return false;

  const { error } = await supabase.from("agents").insert(
    missing.map((seed) => ({
      agent_id: seed.agent_id,
      name: seed.name,
      role: seed.role,
      purpose: seed.purpose,
      is_active: true,
      capability_tags: seed.capability_tags || [],
      model: seed.model || null,
      instructions_md: seed.instructions_md || null,
    })),
  );

  return !error;
}

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

async function bootstrapAgentFolders(agents: Agent[], groups: AgentGroup[]) {
  let didChange = false;
  let nextGroups = groups;

  if (nextGroups.length === 0 && agents.length > 0) {
    const { data, error } = await supabase
      .from("agent_groups")
      .insert(defaultAgentFolders.map((folder) => ({ name: folder.name, domain: "agents" })))
      .select("id, name, domain, leader_agent_id, max_children, parent_group_id");

    if (!error) {
      nextGroups = (data as AgentGroup[]) || [];
      didChange = true;
    }
  }

  if (nextGroups.length === 0) return didChange;

  const rootGroupsByName = new Map(
    nextGroups
      .filter((group) => !group.parent_group_id)
      .map((group) => [normalizeFolderName(group.name), group]),
  );
  const validGroupIds = new Set(nextGroups.map((group) => group.id));
  const updates = agents
    .filter((agent) => !agent.group_id || !validGroupIds.has(agent.group_id))
    .map((agent) => {
      const folderName =
        defaultAgentFolders.find((folder) => folder.key === defaultFolderKeyForAgent(agent))?.name || "";
      const targetGroup = rootGroupsByName.get(normalizeFolderName(folderName));
      return targetGroup ? { id: agent.id, group_id: targetGroup.id } : null;
    })
    .filter((value): value is { id: string; group_id: string } => Boolean(value));

  if (updates.length > 0) {
    const results = await Promise.all(
      updates.map((update) =>
        supabase.from("agents").update({ group_id: update.group_id }).eq("id", update.id),
      ),
    );

    if (results.some((result) => !result.error)) {
      didChange = true;
    }
  }

  return didChange;
}

function buildAgentFolderDocs(groups: AgentGroup[], agents: Agent[]) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const childGroupsByParent = new Map<string | null, AgentGroup[]>();
  const validGroupIds = new Set(groups.map((group) => group.id));

  for (const group of groups) {
    const key = group.parent_group_id;
    const existing = childGroupsByParent.get(key) || [];
    existing.push(group);
    childGroupsByParent.set(key, existing);
  }

  for (const [key, value] of childGroupsByParent.entries()) {
    childGroupsByParent.set(key, [...value].sort(sortGroups));
  }

  const depthCache = new Map<string, number>();
  const getDepth = (groupId: string): number => {
    const cached = depthCache.get(groupId);
    if (cached !== undefined) return cached;

    const group = groupsById.get(groupId);
    if (!group) return 0;

    const depth = group.parent_group_id ? getDepth(group.parent_group_id) + 1 : 1;
    depthCache.set(groupId, depth);
    return depth;
  };

  const buildReadme = (title: string, childGroups: AgentGroup[], folderAgents: Agent[]) => {
    const folderName = title.replace(/\/$/, "");
    const lines = [
      `# ${title}`,
      "",
      "## Folder Purpose",
      describeAgentFolder(folderName),
      "",
      "## Picker Guidance",
      agentFolderPickerHint(folderName),
      "",
      "## Child Folders",
      childGroups.length > 0
        ? childGroups.map((group) => `- \`${group.name}/\` - ${describeAgentFolder(group.name)}`).join("\n")
        : "- No subfolders yet.",
      "",
      "## Agent Files",
      folderAgents.length > 0
        ? folderAgents
            .sort(sortAgents)
            .map((agent) => {
              const tags = agent.capability_tags && agent.capability_tags.length > 0 ? agent.capability_tags.join(", ") : "none";
              return `- \`${agent.name}.agent\` (\`${agent.agent_id}\`) - role: ${agent.role}; status: ${agent.is_active ? "active" : "inactive"}; model: ${agent.model || "unassigned"}; tags: ${tags}; purpose: ${agent.purpose}`;
            })
            .join("\n")
        : "- No agent files in this folder yet.",
    ];

    return lines.join("\n");
  };

  const rootGroups = childGroupsByParent.get(null) || [];
  const rootAgents = agents.filter((agent) => folderIdForAgent(agent, validGroupIds) === "");

  const docs: AgentFolderDoc[] = [
    {
      folder_path: "",
      folder_name: "Agents",
      parent_path: null,
      depth: 0,
      readme_title: "Agents README",
      readme_content: buildReadme("Agents/", rootGroups, rootAgents),
      file_count: rootAgents.length,
      child_folder_count: rootGroups.length,
    },
  ];

  for (const group of [...groups].sort(sortGroups)) {
    const childGroups = childGroupsByParent.get(group.id) || [];
    const folderAgents = agents.filter((agent) => folderIdForAgent(agent, validGroupIds) === group.id);

    docs.push({
      folder_path: group.id,
      folder_name: group.name,
      parent_path: group.parent_group_id || "",
      depth: getDepth(group.id),
      readme_title: `${group.name} README`,
      readme_content: buildReadme(`${group.name}/`, childGroups, folderAgents),
      file_count: folderAgents.length,
      child_folder_count: childGroups.length,
    });
  }

  return docs;
}

function buildBreadcrumbs(currentPath: string, groupsById: Map<string, AgentGroup>) {
  if (!currentPath) return [];

  const breadcrumbs: AgentGroup[] = [];
  let cursor = groupsById.get(currentPath) || null;

  while (cursor) {
    breadcrumbs.unshift(cursor);
    cursor = cursor.parent_group_id ? groupsById.get(cursor.parent_group_id) || null : null;
  }

  return breadcrumbs;
}

function ancestorGroupIds(groupId: string, groupsById: Map<string, AgentGroup>) {
  return buildBreadcrumbs(groupId, groupsById).map((group) => group.id);
}

function descendantGroupIds(groupId: string, childGroupIdsByParent: Map<string, string[]>) {
  const descendants = [groupId];
  const queue = [...(childGroupIdsByParent.get(groupId) || [])];

  while (queue.length > 0) {
    const nextId = queue.shift();
    if (!nextId) continue;
    descendants.push(nextId);
    queue.push(...(childGroupIdsByParent.get(nextId) || []));
  }

  return descendants;
}

function filterLegacyToolGroups(groups: AgentGroup[], allAgents: Agent[]) {
  const childGroupIdsByParent = new Map<string, string[]>();

  for (const group of groups) {
    const key = group.parent_group_id || "";
    const existing = childGroupIdsByParent.get(key) || [];
    existing.push(group.id);
    childGroupIdsByParent.set(key, existing);
  }

  const hiddenGroupIds = new Set<string>();

  for (const group of groups) {
    if (normalizeFolderName(group.name) !== "tools") continue;

    const branchIds = new Set(descendantGroupIds(group.id, childGroupIdsByParent));
    const branchAgents = allAgents.filter((agent) => agent.group_id && branchIds.has(agent.group_id));
    const hasNonToolAgents = branchAgents.some((agent) => !isCodeToolAgent(agent));

    if (!hasNonToolAgents) {
      branchIds.forEach((id) => hiddenGroupIds.add(id));
    }
  }

  return groups.filter((group) => !hiddenGroupIds.has(group.id));
}

export default function AgentsPage() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [folderDocs, setFolderDocs] = useState<AgentFolderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "readme", path: "" });
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [initialGroupId, setInitialGroupId] = useState<string | null>(null);

  const fetchAgents = useCallback(
    async (options?: { currentPath?: string; selection?: Selection }) => {
      setLoading(true);

      let nextAgents = await fetchAllAgents();
      const seededRuntime = await seedRuntimeAgents(nextAgents);
      const seededTools = await seedCodeTools(nextAgents);

      if (seededRuntime || seededTools) {
        nextAgents = await fetchAllAgents();
      }

      const visibleAgents = nextAgents.filter((agent) => !isCodeToolAgent(agent));
      let nextGroups = await fetchAgentGroups();
      const bootstrapped = await bootstrapAgentFolders(visibleAgents, nextGroups);

      if (bootstrapped) {
        nextAgents = await fetchAllAgents();
        nextGroups = await fetchAgentGroups();
      }

      const visibleRefreshedAgents = nextAgents.filter((agent) => !isCodeToolAgent(agent));
      const visibleGroups = filterLegacyToolGroups(nextGroups, nextAgents);
      const nextGroupsById = new Map(visibleGroups.map((group) => [group.id, group]));
      const requestedPath = options?.currentPath ?? "";
      const nextPath = requestedPath && !nextGroupsById.has(requestedPath) ? "" : requestedPath;
      setAgents(visibleRefreshedAgents);
      setGroups(visibleGroups);
      setFolderDocs(buildAgentFolderDocs(visibleGroups, visibleRefreshedAgents));
      setCurrentPath(nextPath);
      setExpandedPaths(nextPath ? ancestorGroupIds(nextPath, nextGroupsById) : []);
      setSelection(options?.selection ?? { kind: "readme", path: nextPath });
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const childGroupIdsByParent = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const group of groups) {
      const key = group.parent_group_id || "";
      const existing = map.get(key) || [];
      existing.push(group.id);
      map.set(key, existing);
    }

    return map;
  }, [groups]);
  const groupIds = useMemo(() => new Set(groups.map((group) => group.id)), [groups]);
  const currentDoc = folderDocs.find((doc) => doc.folder_path === currentPath) || null;
  const currentGroup = currentPath ? groupsById.get(currentPath) || null : null;
  const childFolders = folderDocs
    .filter((doc) => doc.parent_path === currentPath)
    .sort((left, right) => left.folder_name.localeCompare(right.folder_name));
  const agentsInFolder = agents
    .filter((agent) => folderIdForAgent(agent, groupIds) === currentPath)
    .sort(sortAgents);
  const currentReadme =
    selection.kind === "readme"
      ? folderDocs.find((doc) => doc.folder_path === selection.path) || currentDoc
      : currentDoc;
  const currentAgent =
    selection.kind === "agent" ? agents.find((agent) => agent.id === selection.id) || null : null;
  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentPath, groupsById), [currentPath, groupsById]);
  const pathCrumbs = useMemo<ExplorerPathCrumb[]>(
    () =>
      breadcrumbs.map((group) => ({
        label: group.name,
        path: group.id,
      })),
    [breadcrumbs],
  );

  const ensureExpandedPath = useCallback((path: string) => {
    if (!path) return;
    setExpandedPaths((currentPaths) =>
      Array.from(new Set([...currentPaths, ...ancestorGroupIds(path, groupsById)])),
    );
  }, [groupsById]);

  const handlePathSelect = useCallback((path: string) => {
    setCurrentPath(path);
    setSelection({ kind: "readme", path });
    ensureExpandedPath(path);
  }, [ensureExpandedPath]);

  const handleAgentSelect = useCallback(
    (id: string) => {
      const agent = agents.find((candidate) => candidate.id === id);
      if (!agent) return;

      const path = folderIdForAgent(agent, groupIds);
      setCurrentPath(path);
      setSelection({ kind: "agent", id });
      ensureExpandedPath(path);
    },
    [agents, ensureExpandedPath, groupIds],
  );

  const handleCreateFolder = useCallback(async () => {
    const name = window.prompt(currentGroup ? `New folder inside ${currentGroup.name}` : "New folder name");
    if (!name) return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const exists = groups.some(
      (group) =>
        (group.parent_group_id || "") === currentPath &&
        normalizeFolderName(group.name) === normalizeFolderName(trimmedName),
    );

    if (exists) {
      toast({
        title: "Folder already exists",
        description: "Choose a different folder name in this location.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("agent_groups")
      .insert({
        name: trimmedName,
        domain: "agents",
        parent_group_id: currentPath || null,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Could not create folder", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Folder created" });
    await fetchAgents({
      currentPath: data.id,
      selection: { kind: "readme", path: data.id },
    });
  }, [currentGroup, currentPath, fetchAgents, groups, toast]);

  const handleCreateAgent = useCallback(async () => {
    const name = window.prompt(currentGroup ? `New agent name inside ${currentGroup.name}` : "New agent name");
    if (!name) return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const exists = agents.some(
      (agent) =>
        folderIdForAgent(agent, groupIds) === currentPath &&
        agent.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (exists) {
      toast({
        title: "Agent already exists",
        description: "Choose a different file name in this folder.",
        variant: "destructive",
      });
      return;
    }

    const nextAgentId = await generateAgentId();
    const templateAgent = {
      agent_id: nextAgentId,
      name: trimmedName,
      role: "specialist",
      purpose: buildTemplateAgentPurpose(trimmedName),
      is_active: false,
      capability_tags: [],
      model: null,
      group_id: currentPath || null,
      identity_yaml: null,
      instructions_md: buildAgentTemplate(trimmedName),
    };

    const { data, error } = await supabase
      .from("agents")
      .insert(templateAgent)
      .select("id, agent_id, name, role, purpose, is_active, capability_tags, model, group_id, identity_yaml, instructions_md")
      .single();

    if (error) {
      toast({ title: "Could not create agent", description: error.message, variant: "destructive" });
      return;
    }

    const createdAgent = data as Agent;
    await fetchAgents({
      currentPath: createdAgent.group_id || "",
      selection: { kind: "agent", id: createdAgent.id },
    });

    setSelectedAgent(createdAgent);
    setInitialGroupId(createdAgent.group_id);
    setIsNew(false);
    setConfigOpen(true);
    toast({ title: "Template agent created" });
  }, [agents, currentGroup, currentPath, fetchAgents, groupIds, toast]);

  const handleDeleteSelectedAgent = useCallback(async () => {
    if (selection.kind !== "agent") return;

    const agent = agents.find((candidate) => candidate.id === selection.id);
    if (!agent) return;

    if (protectedAgentIds.has(agent.agent_id)) {
      toast({
        title: "System agent is protected",
        description: "Only custom agents can be deleted from this menu.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(`Do you really want to delete agent "${agent.name}"?`)) {
      return;
    }

    const targetPath = folderIdForAgent(agent, groupIds);
    const { error } = await supabase.from("agents").delete().eq("id", agent.id);

    if (error) {
      toast({ title: "Could not delete agent", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Agent deleted" });
    await fetchAgents({
      currentPath: targetPath,
      selection: { kind: "readme", path: targetPath },
    });
  }, [agents, fetchAgents, groupIds, selection, toast]);

  const handleDeleteCurrentFolder = useCallback(async () => {
    if (!currentGroup) return;

    if (childFolders.length > 0 || agentsInFolder.length > 0) {
      toast({
        title: "Folder must be empty",
        description: "Move or delete the subfolders and agents inside it first.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(`Delete folder "${currentGroup.name}"?`)) {
      return;
    }

    const parentPath = currentGroup.parent_group_id || "";
    const { error } = await supabase.from("agent_groups").delete().eq("id", currentGroup.id);

    if (error) {
      toast({ title: "Could not delete folder", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Folder deleted" });
    await fetchAgents({
      currentPath: parentPath,
      selection: { kind: "readme", path: parentPath },
    });
  }, [agentsInFolder.length, childFolders.length, currentGroup, fetchAgents, toast]);

  const handleSidebarToggle = useCallback((path: string, nextExpanded: boolean) => {
    setExpandedPaths((currentPaths) => {
      if (nextExpanded) {
        return Array.from(new Set([...currentPaths, ...ancestorGroupIds(path, groupsById)]));
      }

      const hiddenIds = new Set(descendantGroupIds(path, childGroupIdsByParent));
      return currentPaths.filter((candidate) => !hiddenIds.has(candidate));
    });
  }, [childGroupIdsByParent, groupsById]);

  const handleSidebarCollapse = useCallback(() => {
    setExpandedPaths([]);
  }, []);

  const sidebarExplorer = useMemo(
    () => ({
      title: "Agents Explorer",
      rootLabel: "Agents",
      route: "/agents",
      folders: folderDocs
        .filter((doc) => doc.folder_path !== "")
        .map((doc) => ({
          path: doc.folder_path,
          name: doc.folder_name,
          parentPath: doc.parent_path,
          depth: doc.depth,
        })),
      files: agents.map((agent) => ({
        id: agent.id,
        name: shortAgentListName(agent.name),
        parentPath: folderIdForAgent(agent, groupIds),
      })),
      selectedFileId: selection.kind === "agent" ? selection.id : null,
      onSelectFile: handleAgentSelect,
      actions: [
        {
          key: "new-folder",
          label: currentGroup ? "New Subfolder" : "New Folder",
          onSelect: handleCreateFolder,
        },
        {
          key: "new-agent",
          label: "Add Agent",
          onSelect: handleCreateAgent,
        },
        {
          key: "delete-agent",
          label:
            selection.kind === "agent" && currentAgent
              ? `Delete ${currentAgent.name}`
              : "Delete Selected Agent",
          onSelect: handleDeleteSelectedAgent,
          disabled:
            selection.kind !== "agent" ||
            !currentAgent ||
            protectedAgentIds.has(currentAgent.agent_id),
          destructive: true,
          separatorBefore: true,
        },
        {
          key: "delete-folder",
          label: currentGroup ? `Delete ${currentGroup.name}` : "Delete Current Folder",
          onSelect: handleDeleteCurrentFolder,
          disabled: !currentGroup,
          destructive: true,
        },
      ],
      expandedPaths,
      currentPath,
      onSelectPath: handlePathSelect,
      onTogglePath: handleSidebarToggle,
      onCollapse: handleSidebarCollapse,
      emptyStateLabel: "No agent folders yet.",
    }),
    [
      agents,
      currentAgent,
      currentGroup,
      currentPath,
      expandedPaths,
      folderDocs,
      groupIds,
      handleAgentSelect,
      handleCreateAgent,
      handleCreateFolder,
      handleDeleteCurrentFolder,
      handleDeleteSelectedAgent,
      handleSidebarCollapse,
      handlePathSelect,
      handleSidebarToggle,
      selection,
    ],
  );

  useRegisterSidebarExplorer(sidebarExplorer);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        <ExplorerBrowserLayout
          rootLabel="Agents"
          breadcrumbs={pathCrumbs}
          onSelectPath={handlePathSelect}
          toolbar={
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={handleCreateAgent}>
                Add Agent
              </Button>
            </div>
          }
          list={
            <div className="space-y-1">
              {childFolders.map((folder) => (
                <ExplorerListItem
                  key={folder.folder_path}
                  icon={<Folder className="h-4 w-4 text-primary" />}
                  title={folder.folder_name}
                  subtitle={`${folder.file_count} agents`}
                  kindLabel="Folder"
                  onClick={() => handlePathSelect(folder.folder_path)}
                />
              ))}

              {agentsInFolder.map((agent) => (
                <ExplorerListItem
                  key={agent.id}
                  icon={<FileCode2 className="h-4 w-4 text-info" />}
                  title={shortAgentListName(agent.name)}
                  subtitle={[agent.agent_id, agent.model || "no model"].join(" · ")}
                  kindLabel="Agent"
                  selected={selection.kind === "agent" && selection.id === agent.id}
                  onClick={() => handleAgentSelect(agent.id)}
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
            </div>
          }
          preview={
            currentAgent ? (
              <AgentInspector
                agent={currentAgent}
                onEdit={() => {
                  setSelectedAgent(currentAgent);
                  setInitialGroupId(currentAgent.group_id);
                  setIsNew(false);
                  setConfigOpen(true);
                }}
              />
            ) : currentReadme ? (
              <FolderReadme doc={currentReadme} />
            ) : (
              <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">Select a file to preview it.</div>
            )
          }
        />
      </div>

      <AgentConfigModal
        agent={selectedAgent}
        initialGroupId={initialGroupId}
        isNew={isNew}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSaved={(savedAgent) =>
          fetchAgents({
            currentPath: savedAgent.groupId || "",
            selection: { kind: "agent", id: savedAgent.id },
          })
        }
      />
    </>
  );
}

function FolderReadme({ doc }: { doc: AgentFolderDoc }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileText className="h-4 w-4 text-accent" />
          README.md
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{doc.readme_title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {doc.child_folder_count} child folder{doc.child_folder_count === 1 ? "" : "s"} and {doc.file_count} agent file
          {doc.file_count === 1 ? "" : "s"} indexed here.
        </p>
      </div>

      <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-relaxed text-muted-foreground">
        {doc.readme_content}
      </pre>
    </div>
  );
}

function AgentInspector({ agent, onEdit }: { agent: Agent; onEdit: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileCode2 className="h-4 w-4 text-info" />
          Agent File
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{agent.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{agent.purpose}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{agent.role}</Badge>
          <Badge>{agent.is_active ? "active" : "inactive"}</Badge>
          <Badge>{agent.model || "no model"}</Badge>
          <Badge>{agent.agent_id}</Badge>
        </div>

        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onEdit}>
          <PencilLine className="h-4 w-4" />
          Open Agent Editor
        </Button>
      </div>

      {agent.capability_tags && agent.capability_tags.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
          <div className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Capability Tags</div>
          <div className="flex flex-wrap gap-2">
            {agent.capability_tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <div className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Raw Prompt Text</div>
        <pre className="min-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/80 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {agent.instructions_md || "No instructions are stored for this agent yet."}
        </pre>
      </div>
    </div>
  );
}
