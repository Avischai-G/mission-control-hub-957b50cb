import { Radio } from "lucide-react";

export default function LiveFeedPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">Live Feed</h1>
        <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-glow" />
          <span className="font-mono text-[10px] text-success uppercase">Listening</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Real-time event stream: tool calls, delegations, policy checks, audit log entries, and agent state transitions.
      </p>

      <div className="rounded-lg border border-border bg-card/80 font-mono text-xs">
        <div className="border-b border-border px-4 py-2 flex items-center gap-3 text-muted-foreground">
          <Radio className="h-3.5 w-3.5" />
          <span>Event Stream</span>
        </div>
        <div className="p-6 text-center text-muted-foreground/50 min-h-[400px] flex items-center justify-center">
          <p>Awaiting backend connection to stream events...</p>
        </div>
      </div>
    </div>
  );
}
