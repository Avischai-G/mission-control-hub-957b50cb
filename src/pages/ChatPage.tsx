import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import {
  Send, Loader2, RotateCcw, ExternalLink,
  Bot, FileCode, X, AlertTriangle, ListChecks, Clock, Cpu
} from "lucide-react";
import { streamChat, subscribeToTasks, subscribeToCompletedTasks, type Msg, type ActiveTask, type StreamMeta } from "@/lib/chat-stream";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { TaskPanel } from "@/components/chat/TaskPanel";
import { AgentIndicator } from "@/components/chat/AgentIndicator";
import { CompactTimeline, CompactTimelineExpanded } from "@/components/chat/CompactTimeline";

// ── Types ──
interface CodeAttachment {
  code: string;
  language: string;
  lineCount: number;
}

function formatTime(ts?: string) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function detectLanguage(code: string): string {
  if (code.includes("import ") || code.includes("export ") || code.includes("const ")) return "typescript";
  if (code.includes("def ") || code.includes("class ")) return "python";
  if (code.includes("<html") || code.includes("<div")) return "html";
  return "text";
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [codeAttachment, setCodeAttachment] = useState<CodeAttachment | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [lastSentText, setLastSentText] = useState("");
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  // Track which taskId is associated with the current streaming assistant message
  const currentTaskIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derived state
  const hasRunningTasks = activeTasks.some(t => t.status !== "done" && t.status !== "failed");
  const hasPlan = activeTasks.some(t => t.actions.length > 1); // more than just "classifying"
  const showIndicator = hasRunningTasks && !hasPlan;
  const showPanel = hasRunningTasks && hasPlan;
  const currentAgentName = activeTasks[0]?.agentName;

  // Subscribe to running tasks
  useEffect(() => {
    return subscribeToTasks(setActiveTasks);
  }, []);

  // Subscribe to completed tasks → attach to the correct message
  useEffect(() => {
    return subscribeToCompletedTasks((completedTask) => {
      setMessages(prev => {
        // Find the assistant message that has this taskId
        const targetIdx = prev.findIndex(m => m.taskId === completedTask.id);
        if (targetIdx !== -1) {
          // Attach completed task to the existing message
          return prev.map((m, i) => 
            i === targetIdx ? { ...m, completedTask } : m
          );
        }
        // Fallback: find the last assistant message before any user messages after it
        // This handles the case where no taskId was set
        const lastAssistantIdx = [...prev].reverse().findIndex(m => m.role === "assistant" && !m.completedTask);
        if (lastAssistantIdx !== -1) {
          const realIdx = prev.length - 1 - lastAssistantIdx;
          return prev.map((m, i) =>
            i === realIdx ? { ...m, completedTask } : m
          );
        }
        return prev;
      });
    });
  }, []);

  // Load chat history
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
        .limit(100);
      if (data?.length) {
        setMessages(data.map(m => ({
          role: m.role as Msg["role"],
          content: m.content,
          timestamp: m.created_at,
        })));
      }
    };
    load();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (isAtBottom) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAtBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    const lines = text.split("\n");
    if (lines.length > 5 && (text.includes("{") || text.includes("def ") || text.includes("import ") || text.includes("<"))) {
      e.preventDefault();
      setCodeAttachment({ code: text, language: detectLanguage(text), lineCount: lines.length });
    }
  }, []);

  const send = async (text: string, retrying = false) => {
    const finalText = text.trim();
    if (!finalText && !codeAttachment) return;
    if (isLoading) return;

    let fullContent = finalText;
    if (codeAttachment) {
      fullContent += (finalText ? "\n\n" : "") + "```" + codeAttachment.language + "\n" + codeAttachment.code + "\n```";
    }

    const userMsg: Msg = { role: "user", content: fullContent, timestamp: new Date().toISOString() };
    if (!retrying) setMessages(prev => [...prev, userMsg]);
    setInput("");
    setCodeAttachment(null);
    setIsLoading(true);
    setLastSentText(fullContent);
    setIsAtBottom(true);
    currentTaskIdRef.current = null;

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.failed && !last.completedTask) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar, timestamp: new Date().toISOString(), taskId: currentTaskIdRef.current || undefined }];
      });
    };

    const handleMeta = (meta: StreamMeta) => {
      // When we get a taskId, associate it with the current assistant message
      if (meta.taskId && !currentTaskIdRef.current) {
        currentTaskIdRef.current = meta.taskId;
        // Tag the existing assistant message with this taskId
        setMessages(prev => {
          const lastAssistantIdx = prev.length - 1;
          if (lastAssistantIdx >= 0 && prev[lastAssistantIdx]?.role === "assistant") {
            return prev.map((m, i) => 
              i === lastAssistantIdx ? { ...m, taskId: meta.taskId } : m
            );
          }
          return prev;
        });
      }
    };

    try {
      await streamChat({
        messages: [...(retrying ? messages : [...messages, userMsg])].filter(m => !m.failed),
        onDelta: upsertAssistant,
        onMeta: handleMeta,
        onDone: async () => {
          setIsLoading(false);
          if (assistantSoFar) {
            await supabase.from("chat_messages").insert({ role: "assistant", content: assistantSoFar, agent_id: "secretary" });
          }
        },
      });
    } catch (e: any) {
      setIsLoading(false);
      setMessages(prev => {
        if (prev[prev.length - 1]?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, failed: true, content: m.content || e.message } : m));
        }
        return [...prev, { role: "assistant", content: e.message || "Request failed", timestamp: new Date().toISOString(), failed: true }];
      });
    }
  };

  const handleRetry = () => {
    setMessages(prev => prev.filter((_, i) => i < prev.length - 1));
    send(lastSentText, true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <div className="flex h-[calc(100vh-44px)]">
      {/* ── CHAT AREA ── */}
      <div className="flex flex-col flex-1 min-w-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {/* Header */}
        <div className="shrink-0 h-10 flex items-center justify-between border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 z-20">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">Secretary</span>
            <span className="h-1.5 w-1.5 rounded-full bg-success" title="Always available" />
          </div>
          <div className="flex items-center gap-3">
            {isLoading && !showIndicator && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground transition-opacity duration-500">
                <Loader2 className="h-3 w-3 animate-spin text-accent" />
                Responding…
              </span>
            )}
            <AgentIndicator visible={showIndicator} agentName={currentAgentName} />
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto scroll-smooth" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.length === 0 ? (
              <EmptyState onSend={send} />
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <ChatMessage key={i} msg={msg} onRetry={msg.failed ? handleRetry : undefined} />
                ))}
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start animate-in slide-in-from-bottom-2 fade-in duration-500">
                    <div className="bg-muted rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Code Attachment */}
        {codeAttachment && (
          <div className="border-t border-border bg-card/80 px-4 py-2">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2">
                <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground uppercase">{codeAttachment.language}</span>
                    <span className="text-xs text-muted-foreground">· {codeAttachment.lineCount} lines</span>
                  </div>
                  <pre className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
                    {codeAttachment.code.split("\n").slice(0, 2).join("\n")}
                  </pre>
                </div>
                <button onClick={() => setCodeAttachment(null)} className="text-muted-foreground hover:text-foreground transition-colors duration-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-border bg-card/50 backdrop-blur-sm p-3">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Message…"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow duration-300 font-[var(--font-display)]"
              style={{ maxHeight: 200 }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={(!input.trim() && !codeAttachment) || isLoading}
              className={cn(
                "shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>

      {/* ── TASK PANEL ── */}
      <TaskPanel tasks={activeTasks} visible={showPanel} />
    </div>
  );
}

// ── Sub-components ──

function EmptyState({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <Bot className="h-6 w-6 text-primary" />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground mb-1">Secretary Ready</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Always available. I handle quick questions directly and delegate bigger tasks to specialists — you can keep chatting.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md">
        {["Make me a presentation about Thailand", "Make me a website about me", "Who am I?"].map(q => (
          <button key={q} onClick={() => onSend(q)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatMessage({ msg, onRetry }: { msg: Msg; onRetry?: () => void }) {
  const isUser = msg.role === "user";
  const isFailed = msg.failed;

  return (
    <div className={cn("flex flex-col gap-1.5 animate-in slide-in-from-bottom-2 fade-in duration-500", isUser ? "items-end" : "items-start")}>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm relative group",
        "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isUser ? "bg-primary text-primary-foreground"
          : isFailed ? "bg-destructive/10 border border-destructive/20 text-foreground"
          : "bg-muted text-foreground"
      )}>
        {isFailed && (
          <div className="flex items-center gap-1.5 mb-1.5 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Request failed</span>
          </div>
        )}
        <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0">
          <ReactMarkdown
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className={cn("inline-flex items-center gap-1 underline decoration-1 underline-offset-2 transition-colors duration-300",
                    isUser ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80")}>
                  {children}
                  <ExternalLink className="h-3 w-3 inline-block" />
                </a>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
                if (isInline) return <code className="bg-background/20 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
                return (
                  <pre className="bg-background/80 rounded-lg p-3 overflow-x-auto my-2 border border-border/50">
                    <code className="text-xs font-mono">{children}</code>
                  </pre>
                );
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
        <div className={cn("text-[10px] font-mono mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          isUser ? "text-primary-foreground/50 text-right" : "text-muted-foreground")}>
          {formatTime(msg.timestamp)}
        </div>
        {isFailed && onRetry && (
          <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors duration-300">
            <RotateCcw className="h-3 w-3" /> Retry Request
          </button>
        )}
        {/* Progress timeline toggle — inside the bubble, bottom-right */}
        {!isUser && msg.completedTask && (
          <TimelineToggle task={msg.completedTask} />
        )}
      </div>
    </div>
  );
}

function TimelineToggle({ task }: { task: ActiveTask }) {
  const [open, setOpen] = useState(false);
  const duration = task.completedAt
    ? ((task.completedAt - task.startedAt) / 1000).toFixed(1)
    : null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-medium rounded-full px-2.5 py-1",
          "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open
            ? "bg-primary/10 text-primary border border-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        )}
      >
        <span className="flex items-center gap-1 font-mono text-[9px]">
          <Clock className="h-2.5 w-2.5" />
          {duration ? `${duration}s` : "—"}
        </span>
        <span className="font-mono text-[9px]">{task.actions.length} steps</span>
        <span className="mx-0.5">·</span>
        <ListChecks className="h-3 w-3" />
        Progress timeline
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "max-h-[600px] opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
        )}
      >
        <CompactTimelineExpanded task={task} />
      </div>
    </div>
  );
}
