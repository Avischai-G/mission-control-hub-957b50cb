import { useState, useEffect, useMemo } from "react";
import { X, Save, Loader2, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { runtimeToolDefinitions } from "@/lib/runtime-tools";

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
  parent_group_id: string | null;
};

// Settings that were not functional (policies, etc) have been removed from the UI.

interface AgentConfigModalProps {
  agent: Agent | null;
  initialGroupId?: string | null;
  isNew?: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: (savedAgent: { id: string; groupId: string | null }) => void;
}

const emptyAgent: Omit<Agent, "id"> = {
  agent_id: "",
  name: "",
  role: "specialist",
  purpose: "",
  is_active: true,
  capability_tags: [],
  model: null,
  group_id: null,
  identity_yaml: null,
  instructions_md: null,
};

const generateAgentId = async (): Promise<string> => {
  const { count } = await supabase.from("agents").select("*", { count: "exact", head: true });
  const num = (count || 0) + 1;
  return `agent${String(num).padStart(4, "0")}`;
};

export function AgentConfigModal({ agent, initialGroupId = null, isNew, open, onClose, onSaved }: AgentConfigModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<{ model_id: string; display_name: string }[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);

  const [form, setForm] = useState<Omit<Agent, "id">>(emptyAgent);

  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const [{ data: mRes }, { data: gRes }] = await Promise.all([
        supabase.from("model_registry").select("model_id, display_name").eq("is_active", true),
        supabase
          .from("agent_groups")
          .select("id, name, parent_group_id")
          .eq("domain", "agents")
          .order("created_at", { ascending: true }),
      ]);

      setModels((mRes as { model_id: string; display_name: string }[]) || []);
      setGroups((gRes as AgentGroup[]) || []);

      if (agent && !isNew) {
        const { data: policyRes } = await supabase
          .from("agent_policies")
          .select("allowed_tools")
          .eq("agent_id", agent.agent_id)
          .maybeSingle();

        setForm({
          agent_id: agent.agent_id,
          name: agent.name,
          role: agent.role,
          purpose: agent.purpose,
          is_active: agent.is_active,
          capability_tags: agent.capability_tags || [],
          model: agent.model,
          group_id: agent.group_id,
          identity_yaml: agent.identity_yaml,
          instructions_md: agent.instructions_md,
        });
        setAllowedTools(policyRes?.allowed_tools || []);
      } else {
        const newId = await generateAgentId();
        setForm({ ...emptyAgent, agent_id: newId, group_id: initialGroupId });
        setAllowedTools([]);
      }
      setLoading(false);
    };
    load();
  }, [open, agent, initialGroupId, isNew]);

  const handleSave = async () => {
    if (!form.name || !form.purpose) {
      toast({ title: "Missing required fields", description: "Name and purpose are required.", variant: "destructive" });
      return;
    }
    if (!form.model) {
      toast({ title: "Model required", description: "You must select a model before saving.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let savedId = agent?.id || "";

      if (isNew) {
        const { data: insertedAgent, error } = await supabase
          .from("agents")
          .insert({
            agent_id: form.agent_id,
            name: form.name,
            role: form.role,
            purpose: form.purpose,
            is_active: form.is_active,
            capability_tags: form.capability_tags || [],
            model: form.model,
            group_id: form.group_id,
            identity_yaml: form.identity_yaml,
            instructions_md: form.instructions_md,
          })
          .select("id")
          .single();
        if (error) throw error;
        savedId = insertedAgent.id;
      } else if (agent) {
        const { error } = await supabase.from("agents").update({
          name: form.name,
          purpose: form.purpose,
          is_active: form.is_active,
          capability_tags: form.capability_tags || [],
          model: form.model,
          group_id: form.group_id,
          identity_yaml: form.identity_yaml,
          instructions_md: form.instructions_md,
        }).eq("id", agent.id);
        if (error) throw error;
        savedId = agent.id;
      }

      const { error: policyError } = await supabase
        .from("agent_policies")
        .upsert(
          {
            agent_id: form.agent_id,
            allowed_tools: allowedTools,
          },
          { onConflict: "agent_id" },
        );

      if (policyError) throw policyError;

      toast({ title: "Agent saved" });
      onSaved({ id: savedId, groupId: form.group_id });
      onClose();
    } catch (e: any) {
      toast({ title: "Error saving agent", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  const addTag = () => {
    if (!tagInput.trim()) return;
    const tags = form.capability_tags || [];
    if (!tags.includes(tagInput.trim())) {
      setForm({ ...form, capability_tags: [...tags, tagInput.trim()] });
    }
    setTagInput("");
  };

  const toggleAllowedTool = (toolName: string) => {
    setAllowedTools((currentTools) =>
      currentTools.includes(toolName)
        ? currentTools.filter((currentTool) => currentTool !== toolName)
        : [...currentTools, toolName],
    );
  };

  const groupOptions = useMemo(() => {
    const groupsByParent = new Map<string | null, AgentGroup[]>();

    for (const group of groups) {
      const existing = groupsByParent.get(group.parent_group_id) || [];
      existing.push(group);
      groupsByParent.set(group.parent_group_id, existing);
    }

    for (const [key, value] of groupsByParent.entries()) {
      groupsByParent.set(key, [...value].sort((left, right) => left.name.localeCompare(right.name)));
    }

    const flattened: Array<{ id: string; label: string }> = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const group of groupsByParent.get(parentId) || []) {
        flattened.push({
          id: group.id,
          label: `${"- ".repeat(depth)}${group.name}`,
        });
        walk(group.id, depth + 1);
      }
    };

    walk(null, 0);
    return flattened;
  }, [groups]);

  if (!open) return null;

  const inputCls = "w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelCls = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const textareaCls = `${inputCls} min-h-[120px] font-mono text-xs`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex flex-col rounded-xl border border-border bg-card shadow-2xl" style={{ width: "92vw", height: "90vh", maxWidth: "1400px" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-foreground">{isNew ? "Create Agent" : `Configure: ${agent?.name}`}</h2>
            {!isNew && agent && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${agent.is_active ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground"}`}>
                {agent.is_active ? "active" : "inactive"}
              </span>
            )}
            {!isNew && <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{form.agent_id}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-secondary transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="identity" className="h-full flex flex-col">
              <TabsList className="shrink-0 mx-6 mt-4 bg-secondary/50">
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="prompt">System Prompt</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-auto px-6 py-4">
                {/* ── TAB 1: IDENTITY ── */}
                <TabsContent value="identity" className="mt-0 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className={labelCls}>Display Name *</label>
                      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Research Specialist" className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Purpose *</label>
                      <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="Conducts deep research on a given topic" className={inputCls} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className={labelCls}>Model *</label>
                      <select value={form.model || ""} onChange={e => setForm({ ...form, model: e.target.value || null })} className={`${inputCls} ${!form.model ? "border-destructive/50" : ""}`}>
                        <option value="">— Select a model —</option>
                        {models.map(m => <option key={m.model_id} value={m.model_id}>{m.display_name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-3 pt-5">
                      <Switch checked={form.is_active} onCheckedChange={c => setForm({ ...form, is_active: c })} />
                      <label className="text-sm text-foreground">Agent is active</label>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls}>Folder</label>
                    <select
                      value={form.group_id || ""}
                      onChange={e => setForm({ ...form, group_id: e.target.value || null })}
                      className={inputCls}
                    >
                      <option value="">Agents Root</option>
                      {groupOptions.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className={labelCls}>Allowed Tools</label>
                    <p className="text-[10px] text-muted-foreground">
                      Only the tools checked here are exposed to this agent through <code>agent_policies.allowed_tools</code>.
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {runtimeToolDefinitions.map((tool) => {
                        const selected = allowedTools.includes(tool.name);

                        return (
                          <label
                            key={tool.name}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
                              selected ? "border-primary/40 bg-primary/10" : "border-border/70 bg-secondary/20"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleAllowedTool(tool.name)}
                              className="mt-0.5 h-4 w-4 rounded border-border"
                            />
                            <div className="min-w-0">
                              <div className="font-mono text-xs text-foreground">{tool.name}</div>
                              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls}>Capability Tags</label>
                    <p className="text-[10px] text-muted-foreground">Tags used by the Agent Picker to match this agent to tasks.</p>
                    <div className="flex gap-1.5">
                      <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="e.g. research, summarize, code, html-gen" className={inputCls} />
                      <button type="button" onClick={addTag} className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground hover:bg-primary/90">Add</button>
                    </div>
                    {(form.capability_tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(form.capability_tags || []).map(t => (
                          <span key={t} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                            {t}
                            <button onClick={() => setForm({ ...form, capability_tags: (form.capability_tags || []).filter(x => x !== t) })} className="text-destructive hover:text-destructive/80">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── TAB 2: PROMPT & INSTRUCTIONS ── */}
                <TabsContent value="prompt" className="mt-0 space-y-5">
                  <div className="space-y-1.5">
                    <label className={labelCls}>System Prompt / Instructions (Markdown)</label>
                    <p className="text-[10px] text-muted-foreground">This is the full system prompt sent to the model. It defines what the agent does, how it responds, and its constraints.</p>
                    <textarea
                      value={form.instructions_md || ""}
                      onChange={e => setForm({ ...form, instructions_md: e.target.value || null })}
                      placeholder={`You are {AGENT_NAME}.\n\nRole:\n{ONE_SENTENCE_ROLE}\n\nYou are not responsible for:\n- ...\n\nInput:\nYou receive a structured task packet.\n\nOutput:\nReturn only valid output matching this schema:\n...\n\nMethod:\n1. Identify the deliverable.\n2. Use only supplied context.\n3. Produce the minimum correct result.\n4. Run self-check.\n\nFailure statuses:\n- insufficient_context\n- cannot_execute\n- failed_check`}
                      className={`${textareaCls} min-h-[450px]`}
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
