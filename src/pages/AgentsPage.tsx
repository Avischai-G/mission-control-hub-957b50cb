import { useState, useEffect } from "react";
import { Bot, Shield, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const coreRoles = [
  { id: "secretary", name: "Secretary", desc: "Fast conversational model. Only talks to the user.", icon: "💬" },
  { id: "orchestrator", name: "Main Orchestrator", desc: "Plans tasks, owns checklists, dispatches agents.", icon: "🎯" },
  { id: "memory-retriever", name: "Recent Memory Retriever", desc: "Code-only. Embeds, searches 72h vector memory.", icon: "🔍" },
  { id: "knowledge-selector", name: "Knowledge Selector", desc: "Cheap model. Picks relevant long-term files.", icon: "📚" },
  { id: "knowledge-loader", name: "Knowledge Loader", desc: "Code-only. Opens, validates, trims files.", icon: "📦" },
  { id: "agent-picker", name: "Agent Picker", desc: "Code-first. Filters by type, capability, policy.", icon: "🎲" },
  { id: "privileged-writer", name: "Privileged Writer", desc: "Only core that performs protected writes.", icon: "🔐" },
];

type Agent = {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  purpose: string;
  is_active: boolean;
  capability_tags: string[] | null;
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      const { data } = await supabase.from("agents").select("*").order("created_at", { ascending: true });
      setAgents((data as Agent[]) || []);
      setLoading(false);
    };
    fetch_();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Core runtime roles and specialist agents.
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
        <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Zero-trust enforced</span>
        <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-accent" /> Max 6 children per manager</span>
        <span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-success" /> Deny-by-default gateway</span>
      </div>

      <h2 className="font-display text-sm font-medium text-muted-foreground uppercase tracking-wider">Core Roles</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {coreRoles.map((role) => (
          <div key={role.id} className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">{role.icon}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">built-in</span>
            </div>
            <h3 className="font-display text-sm font-medium text-foreground group-hover:text-primary transition-colors">{role.name}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{role.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="font-display text-sm font-medium text-muted-foreground uppercase tracking-wider">Specialist Agents</h2>
      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">No specialist agents registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {agents.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">🤖</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${a.is_active ? 'bg-success/20 text-success' : 'bg-secondary text-muted-foreground'}`}>
                  {a.is_active ? 'active' : 'inactive'}
                </span>
              </div>
              <h3 className="font-display text-sm font-medium text-foreground group-hover:text-primary transition-colors">{a.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{a.purpose}</p>
              {a.capability_tags?.length ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {a.capability_tags.map(t => (
                    <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{t}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
