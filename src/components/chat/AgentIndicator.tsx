import { Loader2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small indicator in the top-right showing an agent is working.
 * Appears before the plan/timeline is ready, then morphs away.
 */
export function AgentIndicator({ visible, agentName }: { visible: boolean; agentName?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
        "bg-accent/10 border border-accent/20",
        "transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 -translate-y-2 scale-95 pointer-events-none"
      )}
    >
      <div className="relative">
        <Bot className="h-3.5 w-3.5 text-accent" />
        <Loader2 className="h-2.5 w-2.5 text-accent animate-spin absolute -bottom-0.5 -right-0.5" />
      </div>
      <span className="text-[10px] font-medium text-foreground">
        {agentName || "Agent"} working…
      </span>
    </div>
  );
}
