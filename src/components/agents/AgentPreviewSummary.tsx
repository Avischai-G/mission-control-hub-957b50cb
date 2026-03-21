import { Shield } from "lucide-react";
import { ContextIndicatorPill } from "@/components/context/ContextIndicatorPill";
import { cn } from "@/lib/utils";
import type { AgentPromptPreview } from "@/lib/workspace-files";

type AgentPreviewSummaryProps = {
  agentPreview: AgentPromptPreview;
  contextEstimate: {
    estimatedUsedTokens: number;
    contextWindowTokens: number;
    defaultOutputTokens: number;
  };
  className?: string;
};

export function AgentPreviewSummary({
  agentPreview,
  contextEstimate,
  className,
}: AgentPreviewSummaryProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <AgentBadge>{agentPreview.is_active ? "active" : "inactive"}</AgentBadge>
        <AgentBadge>{agentPreview.role}</AgentBadge>
        <AgentBadge>{agentPreview.agent_id}</AgentBadge>
        <ContextIndicatorPill
          usedTokens={contextEstimate.estimatedUsedTokens}
          windowTokens={contextEstimate.contextWindowTokens}
        />
      </div>

      <p className="text-sm text-muted-foreground">{agentPreview.purpose}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Allowed Tools</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {agentPreview.allowed_tools.length > 0 ? agentPreview.allowed_tools.map((tool) => (
              <AgentBadge key={tool}>{tool}</AgentBadge>
            )) : <span className="text-sm text-muted-foreground">No tools allowed.</span>}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Recent Task Domains</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {agentPreview.recent_task_domains.length > 0 ? agentPreview.recent_task_domains.map((domain) => (
              <AgentBadge key={domain}>{domain}</AgentBadge>
            )) : <span className="text-sm text-muted-foreground">No recent domains yet.</span>}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Context Window</div>
          <div className="mt-3 text-sm text-foreground">
            {contextEstimate.contextWindowTokens.toLocaleString()} tokens
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Default Loaded Estimate</div>
          <div className="mt-3 text-sm text-foreground">
            {contextEstimate.estimatedUsedTokens.toLocaleString()} used · {contextEstimate.defaultOutputTokens.toLocaleString()} reserved output
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
      <Shield className="h-3 w-3" />
      {children}
    </span>
  );
}
