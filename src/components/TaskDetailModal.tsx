import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle2, Circle, Clock, AlertTriangle, MessageSquare, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TaskDetail = {
  id: string;
  title: string;
  status: string;
  goal: string | null;
  task_type: string | null;
  assigned_agent_id: string | null;
  context_packet: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  idempotency_key: string | null;
};

type Checklist = { id: string; step: string; status: string; details: string | null; completed_at: string | null; created_at: string };
type ChatMsg = { id: string; role: string; content: string; agent_id: string | null; created_at: string; metadata: Record<string, unknown> | null };
type AuditEntry = { id: string; action: string; actor_agent_id: string | null; result: string; reason: string | null; latency_ms: number | null; created_at: string; request: Record<string, unknown> | null };
type FeedEvt = { id: string; event_type: string; source: string; severity: string; agent_id: string | null; payload: Record<string, unknown> | null; created_at: string };

interface TaskDetailModalProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
}

export function TaskDetailModal({ taskId, open, onClose }: TaskDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [checklist, setChecklist] = useState<Checklist[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [events, setEvents] = useState<FeedEvt[]>([]);

  useEffect(() => {
    if (!open || !taskId) return;
    const load = async () => {
      setLoading(true);
      const [tRes, clRes, mRes, aRes, eRes] = await Promise.all([
        supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
        supabase.from("task_checklists").select("*").eq("task_id", taskId).order("created_at", { ascending: true }),
        supabase.from("chat_messages").select("*").eq("task_id", taskId).order("created_at", { ascending: true }),
        supabase.from("audit_logs").select("*").eq("target_id", taskId).eq("target_type", "task").order("created_at", { ascending: true }),
        supabase.from("live_feed_events").select("*").eq("task_id", taskId).order("created_at", { ascending: true }),
      ]);
      setTask((tRes.data as TaskDetail) || null);
      setChecklist((clRes.data as Checklist[]) || []);
      setMessages((mRes.data as ChatMsg[]) || []);
      setAudits((aRes.data as AuditEntry[]) || []);
      setEvents((eRes.data as FeedEvt[]) || []);
      setLoading(false);
    };
    load();
  }, [open, taskId]);

  if (!open) return null;

  const statusColor = (s: string) => {
    if (s === "failed" || s === "cancelled") return "text-destructive";
    if (s.includes("done") || s.includes("passed") || s === "completed") return "text-success";
    if (s.includes("running") || s.includes("ready")) return "text-info";
    return "text-muted-foreground";
  };

  const severityColor = (s: string) => {
    if (s === "error" || s === "critical") return "text-destructive";
    if (s === "warning") return "text-warning";
    if (s === "info") return "text-info";
    return "text-muted-foreground";
  };

  const checkIcon = (status: string) => {
    if (status === "completed" || status === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />;
    if (status === "running" || status === "in_progress") return <Clock className="h-3.5 w-3.5 text-info animate-pulse shrink-0" />;
    if (status === "failed") return <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />;
    return <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex flex-col rounded-xl border border-border bg-card shadow-2xl" style={{ width: "92vw", height: "90vh", maxWidth: "1400px" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-foreground truncate max-w-[600px]">{task?.title || "Task Detail"}</h2>
            {task && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${statusColor(task.status)}`}>
                {task.status.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-secondary transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !task ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Task not found.</div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="overview" className="h-full flex flex-col">
              <TabsList className="shrink-0 mx-6 mt-4 bg-secondary/50">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="checklist">Checklist ({checklist.length})</TabsTrigger>
                <TabsTrigger value="chat">Chat ({messages.length})</TabsTrigger>
                <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
                <TabsTrigger value="audit">Audit ({audits.length})</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-auto px-6 py-4">
                {/* OVERVIEW */}
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <InfoCard label="Status" value={task.status.replace(/_/g, " ")} />
                    <InfoCard label="Type" value={task.task_type || "—"} />
                    <InfoCard label="Assigned Agent" value={task.assigned_agent_id || "—"} />
                    <InfoCard label="Created" value={new Date(task.created_at).toLocaleString()} />
                  </div>
                  {task.goal && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Goal</label>
                      <p className="text-sm text-foreground bg-secondary/30 rounded-md p-3">{task.goal}</p>
                    </div>
                  )}
                  {task.context_packet && Object.keys(task.context_packet).length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Context Packet</label>
                      <pre className="text-xs font-mono text-muted-foreground bg-secondary/30 rounded-md p-3 overflow-auto max-h-60">{JSON.stringify(task.context_packet, null, 2)}</pre>
                    </div>
                  )}
                  {task.result && Object.keys(task.result).length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Result</label>
                      <pre className="text-xs font-mono text-muted-foreground bg-secondary/30 rounded-md p-3 overflow-auto max-h-60">{JSON.stringify(task.result, null, 2)}</pre>
                    </div>
                  )}
                  {task.constraints && Object.keys(task.constraints).length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Constraints</label>
                      <pre className="text-xs font-mono text-muted-foreground bg-secondary/30 rounded-md p-3 overflow-auto max-h-60">{JSON.stringify(task.constraints, null, 2)}</pre>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <InfoCard label="Idempotency Key" value={task.idempotency_key || "—"} />
                    <InfoCard label="Last Updated" value={new Date(task.updated_at).toLocaleString()} />
                  </div>
                </TabsContent>

                {/* CHECKLIST */}
                <TabsContent value="checklist" className="mt-0">
                  {checklist.length === 0 ? (
                    <div className="text-sm text-muted-foreground/50 text-center py-8">No checklist items.</div>
                  ) : (
                    <div className="space-y-1">
                      {checklist.map(c => (
                        <div key={c.id} className="flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-secondary/30">
                          {checkIcon(c.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{c.step}</p>
                            {c.details && <p className="text-xs text-muted-foreground mt-0.5">{c.details}</p>}
                          </div>
                          <span className={`text-[10px] font-mono uppercase shrink-0 ${statusColor(c.status)}`}>{c.status}</span>
                          {c.completed_at && <span className="text-[10px] text-muted-foreground shrink-0">{new Date(c.completed_at).toLocaleTimeString()}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* CHAT */}
                <TabsContent value="chat" className="mt-0">
                  {messages.length === 0 ? (
                    <div className="text-sm text-muted-foreground/50 text-center py-8">No chat messages for this task.</div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map(m => (
                        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                            {m.agent_id && <div className="text-[10px] font-mono opacity-60 mb-1">@{m.agent_id}</div>}
                            <p className="whitespace-pre-wrap">{m.content}</p>
                            <div className="text-[10px] opacity-50 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* EVENTS */}
                <TabsContent value="events" className="mt-0">
                  {events.length === 0 ? (
                    <div className="text-sm text-muted-foreground/50 text-center py-8">No feed events for this task.</div>
                  ) : (
                    <div className="rounded-lg border border-border divide-y divide-border font-mono text-xs">
                      {events.map(e => (
                        <div key={e.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-secondary/30">
                          <span className="text-muted-foreground/50 w-24 shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                          <span className={`w-14 shrink-0 uppercase ${severityColor(e.severity)}`}>{e.severity}</span>
                          <span className="text-primary shrink-0 w-20">{e.source}</span>
                          <span className="text-foreground">{e.event_type}</span>
                          {e.agent_id && <span className="text-muted-foreground ml-auto">@{e.agent_id}</span>}
                          {e.payload && Object.keys(e.payload).length > 0 && (
                            <details className="ml-2">
                              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">payload</summary>
                              <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap">{JSON.stringify(e.payload, null, 2)}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* AUDIT */}
                <TabsContent value="audit" className="mt-0">
                  {audits.length === 0 ? (
                    <div className="text-sm text-muted-foreground/50 text-center py-8">No audit entries for this task.</div>
                  ) : (
                    <div className="rounded-lg border border-border divide-y divide-border font-mono text-xs">
                      {audits.map(a => (
                        <div key={a.id} className="px-4 py-2.5 space-y-1 hover:bg-secondary/30">
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground/50 w-24 shrink-0">{new Date(a.created_at).toLocaleTimeString()}</span>
                            <span className="text-foreground font-medium">{a.action}</span>
                            <span className={`ml-auto uppercase text-[10px] ${a.result === "allowed" || a.result === "success" ? "text-success" : "text-destructive"}`}>{a.result}</span>
                            {a.actor_agent_id && <span className="text-muted-foreground">@{a.actor_agent_id}</span>}
                            {a.latency_ms != null && <span className="text-muted-foreground">{a.latency_ms}ms</span>}
                          </div>
                          {a.reason && <p className="text-muted-foreground pl-[6.5rem]">{a.reason}</p>}
                          {a.request && Object.keys(a.request).length > 0 && (
                            <details className="pl-[6.5rem]">
                              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">request</summary>
                              <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap">{JSON.stringify(a.request, null, 2)}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground mt-0.5 truncate">{value}</p>
    </div>
  );
}
