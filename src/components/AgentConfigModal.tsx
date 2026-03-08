import { useState, useEffect } from "react";
import { X, Save, Loader2, Shield, Zap, Bot, AlertTriangle } from "lucide-react";
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
  role: "",
  purpose: "",
  is_active: true,
  capability_tags: [],
  model: null,
  group_id: null,
  identity_yaml: null,
  instructions_md: null,
};

export function AgentConfigModal({ agent, isNew, open, onClose, onSaved }: AgentConfigModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [models, setModels] = useState<{ model_id: string; display_name: string }[]>([]);

  // Agent fields
  const [form, setForm] = useState<Omit<Agent, "id">>(emptyAgent);
  const [policy, setPolicy] = useState<Omit<AgentPolicy, "agent_id">>(defaultPolicy);
  const [policyId, setPolicyId] = useState<string | null>(null);

  // Array field helpers
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
      // Load groups and models
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
        // Load policy
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
        setForm(emptyAgent);
        setPolicy(defaultPolicy);
        setPolicyId(null);
      }
      setLoading(false);
    };
    load();
  }, [open, agent, isNew]);

  const handleSave = async () => {
    if (!form.agent_id || !form.name || !form.role || !form.purpose) {
      toast({ title: "Missing required fields", description: "agent_id, name, role, and purpose are required.", variant: "destructive" });
      return;
    }
    if (!form.model) {
      toast({ title: "Model required", description: "You must select a model before saving an agent.", variant: "destructive" });
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
          role: form.role,
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

      // Save policy
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

  const ArrayField = ({ label, items, field, inputValue, setInputValue, placeholder }: {
    label: string; items: string[]; field: keyof typeof policy; inputValue: string; setInputValue: (v: string) => void; placeholder: string;
  }) => (
    <div className="space-y-1.5">
      <label className={labelCls}>{label}</label>
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
    </div>
  );

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
                <TabsTrigger value="policy">Policy & Permissions</TabsTrigger>
                <TabsTrigger value="prompt">Prompt & Instructions</TabsTrigger>
                <TabsTrigger value="connections">Connections</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-auto px-6 py-4">
                {/* IDENTITY TAB */}
                <TabsContent value="identity" className="mt-0 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className={labelCls}>Agent ID *</label>
                      <input value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })} placeholder="e.g. research-specialist" className={inputCls} disabled={!isNew} />
                      <p className="text-[10px] text-muted-foreground">Unique identifier. Cannot be changed after creation.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Display Name *</label>
                      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Research Specialist" className={inputCls} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className={labelCls}>Role *</label>
                      <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="specialist" className={inputCls} />
                      <p className="text-[10px] text-muted-foreground">E.g. specialist, group-leader, worker</p>
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
                    <div className="space-y-1.5">
                      <label className={labelCls}>Group (optional)</label>
                      <select value={form.group_id || ""} onChange={e => setForm({ ...form, group_id: e.target.value || null })} className={inputCls}>
                        <option value="">— No group —</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.domain})</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch checked={form.is_active} onCheckedChange={c => setForm({ ...form, is_active: c })} />
                    <label className="text-sm text-foreground">Agent is active</label>
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls}>Capability Tags (optional)</label>
                    <div className="flex gap-1.5">
                      <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="e.g. research, summarize, code" className={inputCls} />
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

                {/* POLICY TAB */}
                <TabsContent value="policy" className="mt-0 space-y-5">
                  <div className="flex items-center gap-2 rounded-md bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
                    <Shield className="h-4 w-4 shrink-0" />
                    Deny-by-default: only explicitly allowed tools, paths, and domains are accessible.
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

                  <ArrayField label="Allowed Tools" items={policy.allowed_tools} field="allowed_tools" inputValue={toolInput} setInputValue={setToolInput} placeholder="e.g. web_search, file_read" />
                  <ArrayField label="Allowed Models" items={policy.allowed_models} field="allowed_models" inputValue={modelInput} setInputValue={setModelInput} placeholder="e.g. gemini-2.5-flash" />
                  <ArrayField label="Allowed Read Paths" items={policy.allowed_file_paths_read} field="allowed_file_paths_read" inputValue={readPathInput} setInputValue={setReadPathInput} placeholder="e.g. knowledge/**" />
                  <ArrayField label="Allowed Write Paths" items={policy.allowed_file_paths_write} field="allowed_file_paths_write" inputValue={writePathInput} setInputValue={setWritePathInput} placeholder="e.g. knowledge/research/**" />
                  <ArrayField label="Allowed Network Domains" items={policy.allowed_network_domains} field="allowed_network_domains" inputValue={networkInput} setInputValue={setNetworkInput} placeholder="e.g. api.example.com" />
                  <ArrayField label="Allowed Delegate Targets" items={policy.allowed_delegate_targets} field="allowed_delegate_targets" inputValue={delegateInput} setInputValue={setDelegateInput} placeholder="Agent IDs this agent can delegate to" />
                  <ArrayField label="Forbidden Actions" items={policy.forbidden_actions} field="forbidden_actions" inputValue={forbiddenInput} setInputValue={setForbiddenInput} placeholder="e.g. delete_file, send_email" />

                  <div className="space-y-1.5">
                    <label className={labelCls}>Policy YAML (optional, advanced override)</label>
                    <textarea value={policy.policy_yaml || ""} onChange={e => setPolicy({ ...policy, policy_yaml: e.target.value || null })} placeholder="# Raw YAML policy override..." className={textareaCls} />
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls}>Tool Argument Schema (JSON, optional)</label>
                    <textarea value={JSON.stringify(policy.tool_argument_schema, null, 2)} onChange={e => { try { setPolicy({ ...policy, tool_argument_schema: JSON.parse(e.target.value) }); } catch {} }} placeholder="{}" className={textareaCls} />
                  </div>
                </TabsContent>

                {/* PROMPT TAB */}
                <TabsContent value="prompt" className="mt-0 space-y-5">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Identity YAML (optional)</label>
                    <p className="text-[10px] text-muted-foreground mb-1">Defines this agent's identity block: name, role, scope, boundaries.</p>
                    <textarea value={form.identity_yaml || ""} onChange={e => setForm({ ...form, identity_yaml: e.target.value || null })} placeholder={`name: Research Specialist\nrole: Conducts deep research\nscope: research queries only\nboundaries:\n  - No code execution\n  - No file writes`} className={`${textareaCls} min-h-[200px]`} />
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls}>Instructions (Markdown)</label>
                    <p className="text-[10px] text-muted-foreground mb-1">Full system prompt / instructions for this agent. Use the standard template.</p>
                    <textarea value={form.instructions_md || ""} onChange={e => setForm({ ...form, instructions_md: e.target.value || null })} placeholder={`You are {AGENT_NAME}.\n\nRole:\n{ONE_SENTENCE_ROLE}\n\nYou are not responsible for:\n- ...\n\nInput:\nYou receive a structured task packet.\n\nOutput:\nReturn only valid output matching this schema:\n...\n\nMethod:\n1. Identify the deliverable.\n2. Use only supplied context.\n3. Produce the minimum correct result.\n4. Run self-check.\n5. Repair once if possible.\n6. If still blocked, return failure status.\n\nSelf-check:\n- ...\n\nFailure statuses:\n- insufficient_context\n- cannot_execute\n- failed_check`} className={`${textareaCls} min-h-[400px]`} />
                  </div>
                </TabsContent>

                {/* CONNECTIONS TAB */}
                <TabsContent value="connections" className="mt-0 space-y-5">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Group Assignment</label>
                    <select value={form.group_id || ""} onChange={e => setForm({ ...form, group_id: e.target.value || null })} className={inputCls}>
                      <option value="">— No group —</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.domain})</option>)}
                    </select>
                    <p className="text-[10px] text-muted-foreground">Assign to a group for hierarchy management. Max 6 agents per group.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls}>Delegate Targets</label>
                    <p className="text-[10px] text-muted-foreground">Agents this agent is allowed to delegate tasks to (configured in Policy tab).</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {policy.allowed_delegate_targets.length === 0 ? (
                        <span className="text-xs text-muted-foreground/50">No delegate targets configured.</span>
                      ) : policy.allowed_delegate_targets.map(t => (
                        <span key={t} className="rounded bg-secondary px-2 py-0.5 text-[11px] font-mono text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <Zap className="h-3.5 w-3.5 text-accent" />
                      Connection Rules
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Workers receive structured task packets and return structured results only.</li>
                      <li>Workers cannot request secrets or permission escalation.</li>
                      <li>Max 6 direct children per manager group.</li>
                      <li>All delegation must go through the enforcement gateway.</li>
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
