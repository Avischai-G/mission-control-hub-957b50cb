import { useState, useEffect } from "react";
import { Bot, Shield, Zap, Loader2, Plus, ChevronDown, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AgentConfigModal } from "@/components/AgentConfigModal";
import { useToast } from "@/hooks/use-toast";

const coreRoleSeeds = [
  { agent_id: "secretary", name: "Secretary", role: "secretary", purpose: "Fast conversational model. Only talks to the user.", icon: "💬", codeOnly: false },
  { agent_id: "orchestrator", name: "Main Orchestrator", role: "orchestrator", purpose: "Plans tasks, owns checklists, dispatches agents.", icon: "🎯", codeOnly: false },
  { agent_id: "memory-retriever", name: "Recent Memory Retriever", role: "memory-retriever", purpose: "Code-only. Embeds, searches 72h vector memory.", icon: "🔍", codeOnly: true },
  { agent_id: "knowledge-selector", name: "Knowledge Selector", role: "knowledge-selector", purpose: "Cheap model. Picks relevant long-term files.", icon: "📚", codeOnly: false },
  { agent_id: "knowledge-loader", name: "Knowledge Loader", role: "knowledge-loader", purpose: "Code-only. Opens, validates, trims files.", icon: "📦", codeOnly: true },
  { agent_id: "agent-picker", name: "Agent Picker", role: "agent-picker", purpose: "Code-first. Filters by type, capability, policy.", icon: "🎲", codeOnly: true },
  { agent_id: "privileged-writer", name: "Privileged Writer", role: "privileged-writer", purpose: "Only core that performs protected writes.", icon: "🔐", codeOnly: false },
  { agent_id: "agent-maker", name: "Agent Maker", role: "agent-maker", purpose: "Creates narrow specialist agents when routing gaps are found.", icon: "🏭", codeOnly: false },
];

const coreIcons: Record<string, string> = {
  secretary: "💬",
  orchestrator: "🎯",
  "memory-retriever": "🔍",
  "knowledge-selector": "📚",
  "knowledge-loader": "📦",
  "agent-picker": "🎲",
  "privileged-writer": "🔐",
  "agent-maker": "🏭",
};

const coreAgentIds = coreRoleSeeds.map(r => r.agent_id);

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

export default function AgentsPage() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const seedCoreAgents = async (existing: Agent[]) => {
    const existingIds = existing.map(a => a.agent_id);
    const missing = coreRoleSeeds.filter(s => !existingIds.includes(s.agent_id));
    if (missing.length === 0) return;
    const { error } = await supabase.from("agents").insert(
      missing.map(s => ({
        agent_id: s.agent_id,
        name: s.name,
        role: s.role,
        purpose: s.purpose,
        is_active: true,
        capability_tags: [],
      }))
    );
    if (error) {
      console.error("Failed to seed core agents:", error);
    }
  };

  const fetchAgents = async () => {
    const { data } = await supabase.from("agents").select("*").order("created_at", { ascending: true });
    const all = (data as Agent[]) || [];
    // Seed missing core agents
    await seedCoreAgents(all);
    if (coreRoleSeeds.some(s => !all.find(a => a.agent_id === s.agent_id))) {
      // Re-fetch after seeding
      const { data: d2 } = await supabase.from("agents").select("*").order("created_at", { ascending: true });
      setAgents((d2 as Agent[]) || []);
    } else {
      setAgents(all);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const openNew = () => { setSelectedAgent(null); setIsNew(true); setConfigOpen(true); };
  const openEdit = (a: Agent) => { setSelectedAgent(a); setIsNew(false); setConfigOpen(true); };

  // Separate core vs specialist
  const secretary = agents.find(a => a.agent_id === "secretary");
  const orchestrator = agents.find(a => a.agent_id === "orchestrator");
  const otherCore = agents.filter(a => coreAgentIds.includes(a.agent_id) && a.agent_id !== "secretary" && a.agent_id !== "orchestrator");
  const specialists = agents.filter(a => !coreAgentIds.includes(a.agent_id));

  const codeOnlyIds = coreRoleSeeds.filter(s => s.codeOnly).map(s => s.agent_id);

  const AgentCard = ({ agent, badge, size = "normal" }: { agent: Agent; badge?: string; size?: "large" | "normal" }) => {
    const icon = coreIcons[agent.agent_id] || "🤖";
    const isLarge = size === "large";
    const isCodeOnly = codeOnlyIds.includes(agent.agent_id);
    return (
      <div
        onClick={() => !isCodeOnly && openEdit(agent)}
        className={`rounded-lg border bg-card transition-all ${isCodeOnly ? "border-dashed border-border/60 opacity-75" : "border-border hover:border-primary/40 hover:shadow-md group cursor-pointer"} ${isLarge ? "p-5" : "p-4"}`}
      >
        <div className="flex items-start justify-between mb-2">
          <span className={isLarge ? "text-3xl" : "text-2xl"}>{icon}</span>
          <div className="flex items-center gap-1.5">
            {isCodeOnly && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">tool</span>
            )}
            {badge && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary uppercase">{badge}</span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${agent.is_active ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground"}`}>
              {agent.is_active ? "active" : "inactive"}
            </span>
          </div>
        </div>
        <h3 className={`font-display font-medium text-foreground ${!isCodeOnly ? "group-hover:text-primary" : ""} transition-colors ${isLarge ? "text-base" : "text-sm"}`}>{agent.name}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{agent.purpose}</p>
        {isCodeOnly && (
          <div className="mt-2 flex items-center gap-1">
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">no model needed</span>
          </div>
        )}
        {!isCodeOnly && agent.model && (
          <div className="mt-2 flex items-center gap-1">
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{agent.model}</span>
          </div>
        )}
        {!isCodeOnly && !agent.model && (
          <div className="mt-2 flex items-center gap-1">
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-mono text-destructive/70">no model set</span>
          </div>
        )}
        {agent.capability_tags && agent.capability_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {agent.capability_tags.map(t => (
              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{t}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ConnectorLine = () => (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-border" />
        <ArrowDown className="h-3 w-3 text-muted-foreground" />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure core runtime roles and specialist agents. Click any card to edit.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> New Agent
        </button>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
        <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Zero-trust enforced</span>
        <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-accent" /> Max 6 children per manager</span>
        <span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-success" /> Deny-by-default gateway</span>
      </div>

      {/* ── HIERARCHY VIEW ── */}
      <div className="rounded-xl border border-border bg-card/50 p-6 space-y-2">
        <h2 className="font-display text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Runtime Hierarchy</h2>

        {/* Secretary */}
        {secretary && (
          <div className="flex flex-col items-center">
            <div className="w-full max-w-sm">
              <AgentCard agent={secretary} badge="user-facing" size="large" />
            </div>
            <ConnectorLine />
            <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded mb-1">reports to</span>
          </div>
        )}

        {/* Orchestrator */}
        {orchestrator && (
          <div className="flex flex-col items-center">
            <div className="w-full max-w-sm">
              <AgentCard agent={orchestrator} badge="coordinator" size="large" />
            </div>
            <ConnectorLine />
            <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded mb-2">dispatches</span>
          </div>
        )}

        {/* Other core roles – grid under orchestrator */}
        {otherCore.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {otherCore.map(a => (
              <AgentCard key={a.id} agent={a} badge="core" />
            ))}
          </div>
        )}
      </div>

      {/* ── SPECIALIST AGENTS ── */}
      <div className="space-y-3">
        <h2 className="font-display text-sm font-medium text-muted-foreground uppercase tracking-wider">Specialist Agents</h2>
        {specialists.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">No specialist agents registered yet. Click "New Agent" to add one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {specialists.map(a => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </div>

      <AgentConfigModal agent={selectedAgent} isNew={isNew} open={configOpen} onClose={() => setConfigOpen(false)} onSaved={fetchAgents} />
    </div>
  );
}
