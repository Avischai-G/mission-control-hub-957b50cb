import { Loader2, AlertTriangle, ChevronDown, ChevronRight, Cpu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ActiveTask, TaskAction } from "@/lib/chat-stream";

/** Technical sidebar showing running tasks — no result links, pure execution view */
export function TaskSidebar({ tasks }: { tasks: ActiveTask[] }) {
  const hasRunning = tasks.some(t => t.status !== "done" && t.status !== "failed");

  return (
    <div
      className={cn(
        "shrink-0 border-l border-border bg-card/30 backdrop-blur-sm overflow-hidden",
        "transition-[width,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
        hasRunning ? "w-80 opacity-100" : "w-0 opacity-0"
      )}
    >
      <div className={cn(
        "w-80 h-full flex flex-col",
        "transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
        hasRunning ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="shrink-0 h-10 flex items-center justify-between border-b border-border/50 px-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
            <span className="text-xs font-medium text-foreground">Execution Pipeline</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {tasks.filter(t => t.status !== "done" && t.status !== "failed").length} active
          </span>
        </div>

        {/* Tasks */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {tasks.map(task => (
            <RunningTaskCard key={task.id} task={task} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RunningTaskCard({ task }: { task: ActiveTask }) {
  const isRunning = task.status !== "done" && task.status !== "failed";
  const elapsed = ((Date.now() - task.startedAt) / 1000).toFixed(0);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all duration-500",
      "border-accent/30 bg-accent/5"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/20">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        <span className="text-[11px] font-medium text-foreground flex-1 truncate">
          {task.category}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground tabular-nums">{elapsed}s</span>
      </div>

      {/* Timeline */}
      <div className="px-3 py-2 space-y-1">
        {task.actions.map((action, i) => (
          <SidebarTimelineItem key={i} action={action} isLast={i === task.actions.length - 1} />
        ))}
      </div>

      {/* Technical info */}
      {(task.agentName || task.model) && (
        <div className="px-3 pb-2 flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
          <Cpu className="h-2.5 w-2.5" />
          {task.agentName}{task.model ? ` · ${task.model}` : ""}
        </div>
      )}
    </div>
  );
}

function SidebarTimelineItem({ action, isLast }: { action: TaskAction; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-2">
      <div className="flex flex-col items-center pt-1">
        <div className={cn(
          "h-2 w-2 rounded-full shrink-0 transition-colors duration-500",
          action.status === "done" ? "bg-emerald-500"
            : action.status === "failed" ? "bg-destructive"
            : "bg-accent animate-pulse"
        )} />
        {!isLast && <div className="w-px flex-1 bg-border/50 mt-0.5" />}
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <button
          onClick={() => action.output && setExpanded(!expanded)}
          className="flex items-center gap-1 w-full text-left"
        >
          <span className="text-[11px] font-medium text-foreground truncate flex-1">{action.title}</span>
          <span className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0 transition-colors duration-300",
            action.status === "done" ? "text-emerald-600 bg-emerald-500/10"
              : action.status === "failed" ? "text-destructive bg-destructive/10"
              : "text-accent bg-accent/10"
          )}>
            {action.status === "done" ? "Done" : action.status === "failed" ? "Failed" : "Running"}
          </span>
          {action.output && (
            expanded ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
          )}
        </button>
        <span className="text-[10px] font-mono text-muted-foreground">{action.agent}</span>
        {expanded && action.output && (
          <pre className="text-[10px] font-mono bg-background rounded-md p-2 mt-1 overflow-x-auto text-muted-foreground border border-border/50 max-h-24 overflow-y-auto animate-in fade-in duration-200">
            {action.output}
          </pre>
        )}
      </div>
    </div>
  );
}
