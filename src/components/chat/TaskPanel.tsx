import { useState, useEffect, useRef } from "react";
import { Loader2, Cpu, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveTask, TaskAction } from "@/lib/chat-stream";

/**
 * Right-aligned execution panel that pushes the chat left.
 * Features:
 * - Fading separator line (thin, only as tall as content + some extra, fades to transparent)
 * - Thicker timeline line that fades faster
 * - Green progress fill on task completion with ramped easing
 */
export function TaskPanel({ tasks, visible }: { tasks: ActiveTask[]; visible: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContentHeight(entry.contentRect.height);
    });
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  // Calculate completion progress for the green line
  const allActions = tasks.flatMap(t => t.actions);
  const doneActions = allActions.filter(a => a.status === "done").length;
  const totalActions = allActions.length || 1;
  const progress = doneActions / totalActions;

  // Height for separator fade (content + 40px extra)
  const separatorHeight = contentHeight + 40;
  // Timeline line is shorter — content height only, fades faster
  const timelineLineHeight = contentHeight;

  return (
    <div
      className={cn(
        "shrink-0 relative overflow-visible",
        "transition-[width,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible ? "w-72 opacity-100" : "w-0 opacity-0"
      )}
    >
      {/* Fading separator line — thin, fades to transparent */}
      <div
        className="absolute left-0 top-0 w-px pointer-events-none"
        style={{
          height: visible ? separatorHeight : 0,
          background: `linear-gradient(to bottom, hsl(var(--border)) 0%, hsl(var(--border)) 60%, transparent 100%)`,
          transition: "height 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* Inner content — slides in from right */}
      <div
        className={cn(
          "w-72 pt-3 pr-4 pl-5",
          "transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
          visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
        )}
      >
        <div ref={contentRef} className="relative">
          {/* Timeline line — thicker, fades faster, with green progress */}
          <div
            className="absolute left-[5px] top-0 w-[3px] rounded-full pointer-events-none"
            style={{
              height: timelineLineHeight,
              background: `linear-gradient(to bottom, hsl(var(--border)) 0%, hsl(var(--border)) 40%, transparent 100%)`,
              transition: "height 700ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
          {/* Green progress overlay on the timeline line */}
          <div
            className="absolute left-[5px] top-0 w-[3px] rounded-full pointer-events-none"
            style={{
              height: timelineLineHeight * progress,
              background: `linear-gradient(to bottom, hsl(var(--success)) 0%, hsl(var(--success)) 60%, transparent 100%)`,
              transition: "height 1000ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />

          {/* Task items */}
          <div className="space-y-4">
            {tasks.map(task => (
              <TaskTimelineItem key={task.id} task={task} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskTimelineItem({ task }: { task: ActiveTask }) {
  const isRunning = task.status !== "done" && task.status !== "failed";

  return (
    <div className="space-y-2">
      {/* Task header */}
      <div className="flex items-center gap-2 pl-5">
        {isRunning && <Loader2 className="h-3 w-3 animate-spin text-accent shrink-0" />}
        <span className="text-[11px] font-medium text-foreground truncate">
          {task.title || task.category}
        </span>
      </div>

      {/* Actions */}
      {task.actions.map((action, i) => (
        <TimelineAction key={i} action={action} />
      ))}

      {/* Agent info */}
      {(task.agentName || task.model) && (
        <div className="flex items-center gap-1.5 pl-5 text-[9px] font-mono text-muted-foreground">
          <Cpu className="h-2.5 w-2.5" />
          {task.agentName}{task.model ? ` · ${task.model}` : ""}
        </div>
      )}
    </div>
  );
}

function TimelineAction({ action }: { action: TaskAction }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative pl-5">
      {/* Dot on the timeline line */}
      <div
        className={cn(
          "absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-card",
          "transition-colors duration-1000 ease-[cubic-bezier(0.4,0,0.2,1)]",
          action.status === "done"
            ? "bg-success"
            : action.status === "failed"
            ? "bg-destructive"
            : "bg-accent animate-pulse"
        )}
      />

      <button
        onClick={() => action.output && setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        <span className="text-[10px] text-foreground/80 flex-1 truncate">{action.title}</span>
        <span
          className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0",
            "transition-colors duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
            action.status === "done"
              ? "text-success bg-success/10"
              : action.status === "failed"
              ? "text-destructive bg-destructive/10"
              : "text-accent bg-accent/10"
          )}
        >
          {action.status === "done" ? "✓" : action.status === "failed" ? "✗" : "…"}
        </span>
        {action.output && (
          expanded
            ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
        )}
      </button>
      <span className="text-[9px] font-mono text-muted-foreground">{action.agent}</span>

      {expanded && action.output && (
        <pre className="text-[9px] font-mono bg-muted/50 rounded-md p-2 mt-1 overflow-x-auto text-muted-foreground border border-border/30 max-h-20 overflow-y-auto animate-in fade-in duration-200">
          {action.output}
        </pre>
      )}
    </div>
  );
}
