import { useState, useEffect } from "react";
import { X, Save, Loader2, Shield, Zap, Bot, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

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

type AgentPolicy = {
  id?: string;
  agent_id: string;
  allowed_tools: string[];
  allowed_models: string[];
  allowed_file_paths_read: string[];
  allowed_file_paths_write: string[];
  allowed_network_domains: string[];
  allowed_delegate_targets: string[];
  forbidden_actions: string[];
  max_output_tokens: number;
  max_runtime_ms: number;
  max_tool_calls_per_task: number;
  policy_yaml: string | null;
  tool_argument_schema: Record<string, unknown>;
};

type AgentGroup = {
  id: string;
  name: string;
  domain: string;
};

interface AgentConfigModalProps {
  agent: Agent | null;
  isNew?: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const defaultPolicy: Omit<AgentPolicy, "agent_id"> = {
  allowed_tools: [],
  allowed_models: [],
  allowed_file_paths_read: [],
  allowed_file_paths_write: [],
  allowed_network_domains: [],
  allowed_delegate_targets: [],
  forbidden_actions: [],
  max_output_tokens: 4096,
  max_runtime_ms: 30000,
  max_tool_calls_per_task: 20,
  policy_yaml: null,
  tool_argument_schema: {},
};

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

export function AgentConfigModal({ agent, isNew, open, onClose, onSaved }: AgentConfigModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [models, setModels] = useState<{ model_id: string; display_name: string }[]>([]);

  const [form, setForm] = useState<Omit<Agent, "id">>(emptyAgent);
  const [policy, setPolicy] = useState<Omit<AgentPolicy, "agent_id">>(defaultPolicy);
  const [policyId, setPolicyId] = useState<string | null>(null);

  const [tagInput, setTagInput] = useState("");
  const [toolInput, setToolInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [readPathInput, setReadPathInput] = useState("");
  const [writePathInput, setWritePathInput] = useState("");
  const [networkInput, setNetworkInput] = useState("");
  const [delegateInput, setDelegateInput] = useState("");
  const [forbiddenInput, setForbiddenInput] = useState("");

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const [gRes, mRes] = await Promise.all([
        supabase.from("agent_groups").select("id, name, domain"),
        supabase.from("model_registry").select("model_id, display_name").eq("is_active", true),
      ]);
      setGroups((gRes.data as AgentGroup[]) || []);
      setModels((mRes.data as { model_id: string; display_name: string }[]) || []);

      if (agent && !isNew) {
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
        const { data: pData } = await supabase
          .from("agent_policies")
          .select("*")
          .eq("agent_id", agent.agent_id)
          .maybeSingle();
        if (pData) {
          setPolicyId(pData.id);
          setPolicy({
            allowed_tools: (pData.allowed_tools as string[]) || [],
            allowed_models: (pData.allowed_models as string[]) || [],
            allowed_file_paths_read: (pData.allowed_file_paths_read as string[]) || [],
            allowed_file_paths_write: (pData.allowed_file_paths_write as string[]) || [],
            allowed_network_domains: (pData.allowed_network_domains as string[]) || [],
            allowed_delegate_targets: (pData.allowed_delegate_targets as string[]) || [],
            forbidden_actions: (pData.forbidden_actions as string[]) || [],
            max_output_tokens: pData.max_output_tokens ?? 4096,
            max_runtime_ms: pData.max_runtime_ms ?? 30000,
            max_tool_calls_per_task: pData.max_tool_calls_per_task ?? 20,
            policy_yaml: pData.policy_yaml,
            tool_argument_schema: (pData.tool_argument_schema as Record<string, unknown>) || {},
          });
        } else {
          setPolicyId(null);
          setPolicy(defaultPolicy);
        }
      } else {
        const newId = await generateAgentId();
        setForm({ ...emptyAgent, agent_id: newId });
        setPolicy(defaultPolicy);
        setPolicyId(null);
      }
      setLoading(false);
    };
    load();
  }, [open, agent, isNew]);

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
      if (isNew) {
        const { error } = await supabase.from("agents").insert({
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
        });
        if (error) throw error;
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
      }

      const policyPayload = {
        agent_id: form.agent_id,
        allowed_tools: policy.allowed_tools,
        allowed_models: policy.allowed_models,
        allowed_file_paths_read: policy.allowed_file_paths_read,
        allowed_file_paths_write: policy.allowed_file_paths_write,
        allowed_network_domains: policy.allowed_network_domains,
        allowed_delegate_targets: policy.allowed_delegate_targets,
        forbidden_actions: policy.forbidden_actions,
        max_output_tokens: policy.max_output_tokens,
        max_runtime_ms: policy.max_runtime_ms,
        max_tool_calls_per_task: policy.max_tool_calls_per_task,
        policy_yaml: policy.policy_yaml,
        tool_argument_schema: policy.tool_argument_schema as unknown as Record<string, never>,
      };

      if (policyId) {
        await supabase.from("agent_policies").update(policyPayload).eq("id", policyId);
      } else {
        await supabase.from("agent_policies").insert(policyPayload);
      }

      toast({ title: "Agent saved" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Error saving agent", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addToArray = (field: keyof typeof policy, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const arr = policy[field] as string[];
    if (!arr.includes(value.trim())) {
      setPolicy({ ...policy, [field]: [...arr, value.trim()] });
    }
    setter("");
  };

  const removeFromArray = (field: keyof typeof policy, value: string) => {
    setPolicy({ ...policy, [field]: (policy[field] as string[]).filter(v => v !== value) });
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    const tags = form.capability_tags || [];
    if (!tags.includes(tagInput.trim())) {
      setForm({ ...form, capability_tags: [...tags, tagInput.trim()] });
    }
    setTagInput("");
  };

  if (!open) return null;

  const inputCls = "w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelCls = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const textareaCls = `${inputCls} min-h-[120px] font-mono text-xs`;

  const ArrayField = ({ label, items, field, inputValue, setInputValue, placeholder, description }: {
    label: string; items: string[]; field: keyof typeof policy; inputValue: string; setInputValue: (v: string) => void; placeholder: string; description?: string;
  }) => (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
      {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      <div className="flex gap-1.5">
        <input value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addToArray(field, inputValue, setInputValue))} placeholder={placeholder} className={inputCls} />
        <button type="button" onClick={() => addToArray(field, inputValue, setInputValue)} className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground hover:bg-primary/90">Add</button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {items.map(t => (
            <span key={t} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
              {t}
              <button onClick={() => removeFromArray(field, t)} className="text-destructive hover:text-destructive/80">×</button>
            </span>
          ))}
        </div>
      )}
      {items.length === 0 && (
        <p className="text-[10px] text-destructive/70 flex items-center gap-1">
          <Shield className="h-3 w-3" /> No items — agent has zero access for this permission.
        </p>
      )}
    </div>
  );

  const isCoreAgent = ["secretary", "orchestrator", "memory-retriever", "knowledge-selector", "knowledge-loader", "agent-picker", "privileged-writer"].includes(form.agent_id);

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
                <TabsTrigger value="prompt">Prompt & Instructions</TabsTrigger>
                <TabsTrigger value="policy">Policy & Permissions</TabsTrigger>
                <TabsTrigger value="connections">Connection Rules</TabsTrigger>
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

                {/* ── TAB 3: POLICY & PERMISSIONS ── */}
                <TabsContent value="policy" className="mt-0 space-y-5">
                  <div className="flex items-center gap-2 rounded-md bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
                    <Shield className="h-4 w-4 shrink-0" />
                    Deny-by-default: the agent can ONLY use tools, models, paths, and domains explicitly listed below. Empty = zero access.
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className={labelCls}>Max Output Tokens</label>
                      <input type="number" value={policy.max_output_tokens} onChange={e => setPolicy({ ...policy, max_output_tokens: Number(e.target.value) })} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Max Runtime (ms)</label>
                      <input type="number" value={policy.max_runtime_ms} onChange={e => setPolicy({ ...policy, max_runtime_ms: Number(e.target.value) })} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Max Tool Calls / Task</label>
                      <input type="number" value={policy.max_tool_calls_per_task} onChange={e => setPolicy({ ...policy, max_tool_calls_per_task: Number(e.target.value) })} className={inputCls} />
                    </div>
                  </div>

                  <ArrayField
                    label="Allowed Tools"
                    items={policy.allowed_tools}
                    field="allowed_tools"
                    inputValue={toolInput}
                    setInputValue={setToolInput}
                    placeholder="e.g. chat_respond, classify_request, web_search"
                    description="Tools this agent is permitted to invoke. Without entries here, the agent cannot call any tools."
                  />
                  <ArrayField
                    label="Allowed Delegate Targets"
                    items={policy.allowed_delegate_targets}
                    field="allowed_delegate_targets"
                    inputValue={delegateInput}
                    setInputValue={setDelegateInput}
                    placeholder="e.g. orchestrator, agent0008"
                    description="Agent IDs this agent can delegate tasks to. The Secretary delegates to the Orchestrator, the Orchestrator delegates to core agents and specialists."
                  />
                  <ArrayField
                    label="Allowed Models"
                    items={policy.allowed_models}
                    field="allowed_models"
                    inputValue={modelInput}
                    setInputValue={setModelInput}
                    placeholder="e.g. gemini-2.5-flash, gpt-5-mini"
                    description="Models this agent is allowed to call. Must include at least the model assigned in the Identity tab."
                  />
                  <ArrayField
                    label="Allowed Read Paths"
                    items={policy.allowed_file_paths_read}
                    field="allowed_file_paths_read"
                    inputValue={readPathInput}
                    setInputValue={setReadPathInput}
                    placeholder="e.g. knowledge/**, generated-files/**"
                    description="File/storage paths this agent can read from."
                  />
                  <ArrayField
                    label="Allowed Write Paths"
                    items={policy.allowed_file_paths_write}
                    field="allowed_file_paths_write"
                    inputValue={writePathInput}
                    setInputValue={setWritePathInput}
                    placeholder="e.g. generated-files/**"
                    description="File/storage paths this agent can write to. Only the Privileged Writer should have broad write access."
                  />
                  <ArrayField
                    label="Allowed Network Domains"
                    items={policy.allowed_network_domains}
                    field="allowed_network_domains"
                    inputValue={networkInput}
                    setInputValue={setNetworkInput}
                    placeholder="e.g. api.openai.com, *.google.com"
                    description="External domains this agent can make HTTP requests to."
                  />
                  <ArrayField
                    label="Forbidden Actions"
                    items={policy.forbidden_actions}
                    field="forbidden_actions"
                    inputValue={forbiddenInput}
                    setInputValue={setForbiddenInput}
                    placeholder="e.g. delete_file, drop_table, send_email"
                    description="Explicit deny-list. Even if a tool is allowed, these specific actions are blocked."
                  />
                </TabsContent>

                {/* ── TAB 4: CONNECTION RULES ── */}
                <TabsContent value="connections" className="mt-0 space-y-5">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Group Assignment</label>
                    <select value={form.group_id || ""} onChange={e => setForm({ ...form, group_id: e.target.value || null })} className={inputCls}>
                      <option value="">— No group —</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.domain})</option>)}
                    </select>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <Info className="h-3.5 w-3.5 text-primary" />
                      What are Groups?
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Groups are organizational containers that enforce the <strong>max 6 children per manager</strong> rule. When you have many specialist agents, you group them by domain (e.g. "Content Creators", "Data Analysts"). Each group has a <strong>group leader</strong> agent that receives tasks from the Orchestrator and dispatches them within its group. This creates a hierarchy tree:
                    </p>
                    <div className="font-mono text-[10px] text-muted-foreground bg-secondary rounded p-3 leading-relaxed">
                      Orchestrator<br />
                      ├── Memory Retriever<br />
                      ├── Knowledge Selector<br />
                      ├── Agent Picker<br />
                      ├── Privileged Writer<br />
                      ├── Content Group (leader: content-lead)<br />
                      │   ├── website-agent<br />
                      │   ├── presentation-agent<br />
                      │   └── copywriter-agent<br />
                      └── Research Group (leader: research-lead)<br />
                      &nbsp;&nbsp;&nbsp;&nbsp;├── web-researcher<br />
                      &nbsp;&nbsp;&nbsp;&nbsp;└── data-analyst
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Without groups, all specialists report directly to the Orchestrator. Once you exceed 6 specialists, you <strong>must</strong> create groups to stay within the control span limit.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className={labelCls}>Current Delegation Map</label>
                    <div className="rounded-lg border border-border bg-secondary/30 p-4">
                      {policy.allowed_delegate_targets.length === 0 ? (
                        <p className="text-xs text-muted-foreground/50">This agent cannot delegate to any other agents. Configure in Policy & Permissions tab.</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground">This agent can delegate tasks to:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {policy.allowed_delegate_targets.map(t => (
                              <span key={t} className="rounded bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11px] font-mono text-primary">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <Zap className="h-3.5 w-3.5 text-accent" />
                      Enforcement Rules
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                      <li>All task delegation passes through the enforcement gateway.</li>
                      <li>Workers receive structured task packets and return structured results only.</li>
                      <li>Workers cannot request secrets or permission escalation.</li>
                      <li>Max 6 direct children per manager / group leader.</li>
                      <li>Delegation chains cannot exceed 3 levels deep.</li>
                    </ul>
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
