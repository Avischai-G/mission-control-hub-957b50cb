import { useState } from "react";
import { ChevronDown, ChevronRight, Check, AlertTriangle, Clock, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveTask, TaskAction } from "@/lib/chat-stream";

/**
 * Compact collapsible timeline shown inline in chat after task completion.
 * Collapsed by default to keep chat clean — user can expand to see full execution log.
 */
export function CompactTimeline({ task }: { task: ActiveTask }) {
  const [expanded, setExpanded] = useState(false);
  const isFailed = task.status === "failed";
  const duration = task.completedAt
    ? ((task.completedAt - task.startedAt) / 1000).toFixed(1)
    : null;

  const categoryIcon = task.category === "presentation" ? "🎨"
    : task.category === "website" ? "🌐"
    : task.category === "cron" ? "⏰"
    : "⚡";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left",
          "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "border hover:bg-muted/50",
          isFailed ? "border-destructive/20 bg-destructive/5" : "border-border bg-muted/30"
        )}
      >
        <span className="text-sm">{categoryIcon}</span>
        {isFailed
          ? <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
          : <Check className="h-3 w-3 text-success shrink-0" />
        }
        <span className="text-[11px] font-medium text-foreground flex-1 truncate">
          {task.title || task.category}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
          <Clock className="h-2.5 w-2.5" />
          {duration ? `${duration}s` : "—"}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {task.actions.length} steps
        </span>
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-300" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-300" />
        }
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          expanded ? "max-h-[500px] opacity-100 mt-1.5" : "max-h-0 opacity-0 mt-0"
        )}
      >
        <div className="ml-2 pl-3 border-l-2 border-success/30 space-y-1">
          {task.actions.map((action, i) => (
            <CompactAction key={i} action={action} />
          ))}
          {task.agentName && (
            <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono text-muted-foreground">
              <Cpu className="h-2.5 w-2.5" />
              {task.agentName}{task.model ? ` · ${task.model}` : ""}
            </div>
          )}
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors duration-300 pt-1"
            >
              Open result →
            </a>
          )}
          {task.error && (
            <p className="text-[10px] font-mono text-destructive pt-1">{task.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Expanded timeline content — shows steps directly without a collapsible header.
 */
export function CompactTimelineExpanded({ task }: { task: ActiveTask }) {
  const isFailed = task.status === "failed";

  return (
    <div className="animate-in fade-in duration-300">
      <div className={cn("ml-2 pl-3 border-l-2 space-y-1", isFailed ? "border-destructive/30" : "border-success/30")}>
        {task.actions.map((action, i) => (
          <CompactAction key={i} action={action} />
        ))}
        {task.agentName && (
          <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono text-muted-foreground">
            <Cpu className="h-2.5 w-2.5" />
            {task.agentName}{task.model ? ` · ${task.model}` : ""}
          </div>
        )}
        {task.url && (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors duration-300 pt-1"
          >
            Open result →
          </a>
        )}
        {task.error && (
          <p className="text-[10px] font-mono text-destructive pt-1">{task.error}</p>
        )}
      </div>
    </div>
  );
}

function CompactAction({ action }: { action: TaskAction }) {
  const [showOutput, setShowOutput] = useState(false);

  return (
    <div>
      <button
        onClick={() => action.output && setShowOutput(!showOutput)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        <div className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0 transition-colors duration-500",
          action.status === "done" ? "bg-success"
            : action.status === "failed" ? "bg-destructive"
            : "bg-accent"
        )} />
        <span className="text-[10px] text-foreground/80 truncate flex-1">{action.title}</span>
        <span className="text-[9px] font-mono text-muted-foreground">{action.agent}</span>
      </button>
      {showOutput && action.output && (
        <pre className="text-[9px] font-mono bg-muted/50 rounded p-1.5 mt-0.5 ml-3 overflow-x-auto text-muted-foreground border border-border/30 max-h-16 overflow-y-auto animate-in fade-in duration-200">
          {action.output}
        </pre>
      )}
    </div>
  );
}
