import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import {
  Send, Loader2, RotateCcw, ExternalLink, ChevronDown, ChevronRight,
  Bot, FileCode, X, AlertTriangle, Check, ExternalLink as LinkIcon
} from "lucide-react";
import { streamChat, subscribeToTasks, dismissTask, type Msg, type ActiveTask, type TaskAction } from "@/lib/chat-stream";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

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

// ══════════════════════════════════════════════
// ChatPage — split layout: chat center + task panel right
// ══════════════════════════════════════════════
export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [codeAttachment, setCodeAttachment] = useState<CodeAttachment | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [lastSentText, setLastSentText] = useState("");
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to task timeline
  useEffect(() => {
    return subscribeToTasks(setActiveTasks);
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

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.failed) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar, timestamp: new Date().toISOString() }];
      });
    };

    try {
      await streamChat({
        messages: [...(retrying ? messages : [...messages, userMsg])].filter(m => !m.failed),
        onDelta: upsertAssistant,
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

  const hasActiveTasks = activeTasks.length > 0;

  return (
    <div className="flex h-[calc(100vh-44px)]">
      {/* ── CHAT AREA ── */}
      <div className={cn("flex flex-col flex-1 min-w-0 transition-all duration-500 ease-out")}>
        {/* Header */}
        <div className="shrink-0 h-10 flex items-center justify-between border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 z-20">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">Secretary</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Always available" />
          </div>
          {isLoading && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-accent" />
              Responding…
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.length === 0 ? (
              <EmptyState onSend={send} />
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <ChatMessage key={i} msg={msg} onRetry={msg.failed ? handleRetry : undefined} />
                ))}
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start animate-in slide-in-from-bottom-2 fade-in duration-300">
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
                <button onClick={() => setCodeAttachment(null)} className="text-muted-foreground hover:text-foreground transition-colors">
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
              className="flex-1 resize-none rounded-2xl border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow font-[var(--font-display)]"
              style={{ maxHeight: 200 }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={(!input.trim() && !codeAttachment) || isLoading}
              className={cn(
                "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>

      {/* ── TASK TIMELINE PANEL (fixed right) ── */}
      <div
        className={cn(
          "shrink-0 border-l border-border bg-card/30 backdrop-blur-sm overflow-hidden transition-all duration-500 ease-out",
          hasActiveTasks ? "w-80" : "w-0"
        )}
      >
        {hasActiveTasks && (
          <div className="w-80 h-full flex flex-col animate-in slide-in-from-right-4 fade-in duration-500">
            <div className="shrink-0 h-10 flex items-center justify-between border-b border-border/50 px-4">
              <span className="text-xs font-medium text-foreground">Active Tasks</span>
              <span className="text-[10px] font-mono text-muted-foreground">{activeTasks.length}</span>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-3">
              {activeTasks.map(task => (
                <TaskCard key={task.id} task={task} onDismiss={() => dismissTask(task.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
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
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
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
    <div className={cn("flex animate-in slide-in-from-bottom-2 fade-in duration-300", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm relative group",
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
                  className={cn("inline-flex items-center gap-1 underline decoration-1 underline-offset-2",
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
        <div className={cn("text-[10px] font-mono mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity",
          isUser ? "text-primary-foreground/50 text-right" : "text-muted-foreground")}>
          {formatTime(msg.timestamp)}
        </div>
        {isFailed && onRetry && (
          <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors">
            <RotateCcw className="h-3 w-3" /> Retry Request
          </button>
        )}
      </div>
    </div>
  );
}

// ── Task Card (right panel) ──

function TaskCard({ task, onDismiss }: { task: ActiveTask; onDismiss: () => void }) {
  const isDone = task.status === "done";
  const isFailed = task.status === "failed";
  const isRunning = !isDone && !isFailed;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all duration-300",
      isFailed ? "border-destructive/30 bg-destructive/5"
        : isDone ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-accent/30 bg-accent/5"
    )}>
      {/* Card header */}
      <div className={cn("flex items-center gap-2 px-3 py-2 border-b",
        isFailed ? "border-destructive/20" : isDone ? "border-emerald-500/20" : "border-accent/20"
      )}>
        {isFailed ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          : isDone ? <Check className="h-3.5 w-3.5 text-emerald-500" />
          : <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
        <span className="text-[11px] font-medium text-foreground flex-1 truncate">
          {task.category === "presentation" ? "🎨 Presentation" : task.category === "website" ? "🌐 Website" : task.category}
        </span>
        {(isDone || isFailed) && (
          <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="px-3 py-2 space-y-1">
        {task.actions.map((action, i) => (
          <TimelineItem key={i} action={action} isLast={i === task.actions.length - 1} />
        ))}
      </div>

      {/* Result link */}
      {isDone && task.url && (
        <div className="px-3 pb-2">
          <a href={task.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors bg-primary/10 rounded-lg px-2.5 py-1.5 w-full justify-center">
            <ExternalLink className="h-3 w-3" />
            Open Result
          </a>
        </div>
      )}

      {/* Error */}
      {isFailed && task.error && (
        <div className="px-3 pb-2">
          <p className="text-[10px] font-mono text-destructive">{task.error}</p>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ action, isLast }: { action: TaskAction; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-2">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center pt-1">
        <div className={cn("h-2 w-2 rounded-full shrink-0 transition-colors duration-300",
          action.status === "done" ? "bg-emerald-500"
            : action.status === "failed" ? "bg-destructive"
            : "bg-accent animate-pulse"
        )} />
        {!isLast && <div className="w-px flex-1 bg-border/50 mt-0.5" />}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        <button onClick={() => action.output && setExpanded(!expanded)}
          className="flex items-center gap-1 w-full text-left">
          <span className="text-[11px] font-medium text-foreground truncate flex-1">{action.title}</span>
          <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0",
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
          <pre className="text-[10px] font-mono bg-background rounded-md p-2 mt-1 overflow-x-auto text-muted-foreground border border-border/50 max-h-24 overflow-y-auto">
            {action.output}
          </pre>
        )}
      </div>
    </div>
  );
}
