import { Bot, Shield, Zap } from "lucide-react";

const coreRoles = [
  { id: "secretary", name: "Secretary", desc: "Fast conversational model. Only talks to the user.", icon: "💬", status: "idle" },
  { id: "orchestrator", name: "Main Orchestrator", desc: "Plans tasks, owns checklists, dispatches agents.", icon: "🎯", status: "idle" },
  { id: "memory-retriever", name: "Recent Memory Retriever", desc: "Code-only. Embeds, searches 72h vector memory.", icon: "🔍", status: "idle" },
  { id: "knowledge-selector", name: "Knowledge Selector", desc: "Cheap model. Picks relevant long-term files.", icon: "📚", status: "idle" },
  { id: "knowledge-loader", name: "Knowledge Loader", desc: "Code-only. Opens, validates, trims files.", icon: "📦", status: "idle" },
  { id: "agent-picker", name: "Agent Picker", desc: "Code-first. Filters by type, capability, policy.", icon: "🎲", status: "idle" },
  { id: "privileged-writer", name: "Privileged Writer", desc: "Only core that performs protected writes.", icon: "🔐", status: "idle" },
];

export default function AgentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Core runtime roles and specialist agents. Defined by identity.yaml, policy.yaml, and instructions.md.
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
        <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Zero-trust enforced</span>
        <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-accent" /> Max 6 children per manager</span>
        <span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-success" /> Deny-by-default gateway</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {coreRoles.map((role) => (
          <div key={role.id} className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">{role.icon}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                {role.status}
              </span>
            </div>
            <h3 className="font-display text-sm font-medium text-foreground group-hover:text-primary transition-colors">
              {role.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{role.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Specialist agents will appear here once defined in <code className="font-mono text-xs text-primary">agents/&lt;agent_id&gt;/</code>
        </p>
      </div>
    </div>
  );
}
