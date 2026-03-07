import { useState, useEffect } from "react";
import { Radio, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FeedEvent = {
  id: string;
  event_type: string;
  source: string;
  agent_id: string | null;
  severity: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export default function LiveFeedPage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

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

    // Subscribe to realtime events
    const channel = supabase
      .channel("live_feed")
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">Live Feed</h1>
        <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-glow" />
          <span className="font-mono text-[10px] text-success uppercase">Listening</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Real-time event stream from the runtime.</p>

      <div className="rounded-lg border border-border bg-card/80 font-mono text-xs">
        <div className="border-b border-border px-4 py-2 flex items-center gap-3 text-muted-foreground">
          <Radio className="h-3.5 w-3.5" />
          <span>Event Stream</span>
          <span className="ml-auto text-[10px]">{events.length} events</span>
        </div>
        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground/50 min-h-[400px] flex items-center justify-center">
            <p>No events yet. Events will appear as the runtime processes tasks.</p>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto divide-y divide-border">
            {events.map(e => (
              <div key={e.id} className="px-4 py-2 flex items-center gap-3 hover:bg-secondary/30">
                <span className="text-muted-foreground/50 w-40 shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                <span className={`w-16 shrink-0 uppercase ${severityColor(e.severity)}`}>{e.severity}</span>
                <span className="text-primary shrink-0 w-24">{e.source}</span>
                <span className="text-foreground">{e.event_type}</span>
                {e.agent_id && <span className="text-muted-foreground ml-auto">@{e.agent_id}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
