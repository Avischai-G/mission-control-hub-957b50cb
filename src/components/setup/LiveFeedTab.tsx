import { useState, useEffect } from "react";
import { Radio, Loader2, X, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FeedEvent = {
  id: string;
  event_type: string;
  source: string;
  agent_id: string | null;
  severity: string;
  payload: Record<string, unknown>;
  task_id: string | null;
  created_at: string;
};

export function LiveFeedTab() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<FeedEvent | null>(null);

  useEffect(() => {
    const fetch_ = async () => {
      const { data } = await supabase
        .from("live_feed_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setEvents((data as FeedEvent[]) || []);
      setLoading(false);
    };
    fetch_();

    const channel = supabase
      .channel("live_feed_setup")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_feed_events" }, (payload) => {
        setEvents(prev => [payload.new as FeedEvent, ...prev].slice(0, 100));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const severityColor = (s: string) => {
    switch (s) {
      case "error": case "critical": return "text-destructive";
      case "warning": return "text-warning";
      case "info": return "text-info";
      default: return "text-muted-foreground";
    }
  };

  const severityBg = (s: string) => {
    switch (s) {
      case "error": case "critical": return "bg-destructive/10 border-destructive/20";
      case "warning": return "bg-warning/10 border-warning/20";
      case "info": return "bg-info/10 border-info/20";
      default: return "bg-secondary/30 border-border";
    }
  };

  // Full-screen event detail
  if (selectedEvent) {
    const e = selectedEvent;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedEvent(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to feed
          </button>
          <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${severityBg(e.severity)} ${severityColor(e.severity)}`}>{e.severity}</span>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="Event Type" value={e.event_type} />
            <DetailField label="Source" value={e.source} />
            <DetailField label="Agent" value={e.agent_id || "—"} />
            <DetailField label="Task ID" value={e.task_id || "—"} mono />
            <DetailField label="Time" value={new Date(e.created_at).toLocaleString()} />
            <DetailField label="Severity" value={e.severity} />
          </div>

          {e.payload && Object.keys(e.payload).length > 0 && (
            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Full Payload</h4>
              <div className="rounded-lg bg-secondary/30 border border-border p-4 max-h-[400px] overflow-auto">
                {Object.entries(e.payload).map(([key, value]) => (
                  <div key={key} className="flex gap-3 py-1.5 border-b border-border/50 last:border-b-0">
                    <span className="text-xs font-mono text-primary shrink-0 w-40">{key}</span>
                    <span className="text-xs text-foreground font-mono break-all">
                      {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="font-mono text-[10px] text-success uppercase">Listening</span>
        </div>
        <span className="text-xs text-muted-foreground">{events.length} events</span>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-12 text-center">
          <Radio className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No events yet. Events appear as the runtime processes tasks.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {events.map(e => {
            const payloadPreview = e.payload && Object.keys(e.payload).length > 0
              ? Object.entries(e.payload).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`).join(" • ")
              : "";

            return (
              <button
                key={e.id}
                onClick={() => setSelectedEvent(e)}
                className="w-full text-left rounded-lg border border-border bg-card px-4 py-2.5 hover:bg-secondary/30 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  {/* Time */}
                  <span className="text-[11px] font-mono text-muted-foreground/60 w-20 shrink-0 pt-0.5">
                    {new Date(e.created_at).toLocaleTimeString()}
                  </span>

                  {/* Severity + Type */}
                  <span className={`text-[10px] font-mono uppercase w-12 shrink-0 pt-0.5 ${severityColor(e.severity)}`}>
                    {e.severity}
                  </span>
                  <span className="text-xs font-medium text-primary w-28 shrink-0 truncate pt-0.5">{e.event_type}</span>

                  {/* Agent */}
                  <span className="text-xs text-foreground w-36 shrink-0 truncate pt-0.5 font-mono">
                    {e.agent_id ? `@${e.agent_id}` : "—"}
                  </span>

                  {/* Payload preview */}
                  <span className="text-xs text-muted-foreground flex-1 truncate pt-0.5">
                    {payloadPreview || <span className="text-muted-foreground/40 italic">no payload</span>}
                  </span>

                  <Maximize2 className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
