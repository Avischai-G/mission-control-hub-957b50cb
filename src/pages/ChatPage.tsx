import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Send, Check, Loader2, RotateCcw, ExternalLink, ChevronDown, ChevronRight, Bot, Zap, FileCode, X, AlertTriangle } from "lucide-react";
import { streamChat, type Msg, type StreamMeta, type TaskAction } from "@/lib/chat-stream";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

// ── Types ──
interface CodeAttachment {
  code: string;
  language: string;
  lineCount: number;
}

// ── Helpers ──
function formatTime(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function detectLanguage(code: string): string {
  if (code.includes("import ") || code.includes("export ") || code.includes("const ") || code.includes("=> {")) return "typescript";
  if (code.includes("def ") || code.includes("import ") && code.includes(":")) return "python";
  if (code.includes("<html") || code.includes("<div")) return "html";
  if (code.includes("{") && code.includes(":") && !code.includes("function")) return "json";
  return "text";
}

// ── ChatPage ──
export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMeta, setCurrentMeta] = useState<StreamMeta | null>(null);
  const [codeAttachment, setCodeAttachment] = useState<CodeAttachment | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [lastSentText, setLastSentText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Load chat history
  useEffect(() => {
    const loadHistory = async () => {
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
    loadHistory();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAtBottom]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  // Code paste detection
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    const lines = text.split("\n");
    if (lines.length > 5 && (text.includes("{") || text.includes("def ") || text.includes("import ") || text.includes("<"))) {
      e.preventDefault();
      setCodeAttachment({
        code: text,
        language: detectLanguage(text),
        lineCount: lines.length,
      });
    }
  }, []);

  // Send message
  const send = async (text: string, retrying = false) => {
    const finalText = text.trim();
    if (!finalText && !codeAttachment) return;
    if (isLoading) return;

    let fullContent = finalText;
    if (codeAttachment) {
      fullContent += (finalText ? "\n\n" : "") + "```" + codeAttachment.language + "\n" + codeAttachment.code + "\n```";
    }

    const userMsg: Msg = { role: "user", content: fullContent, timestamp: new Date().toISOString() };
    if (!retrying) {
      setMessages(prev => [...prev, userMsg]);
    }
    setInput("");
    setCodeAttachment(null);
    setIsLoading(true);
    setLastSentText(fullContent);
    setCurrentMeta(null);
    setIsAtBottom(true);

    let assistantSoFar = "";
    let latestMeta: StreamMeta | null = null;

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.failed) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar, meta: latestMeta || undefined } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar, timestamp: new Date().toISOString(), meta: latestMeta || undefined }];
      });
    };

    try {
      await streamChat({
        messages: [...(retrying ? messages : [...messages, userMsg])].filter(m => !m.failed),
        onDelta: (chunk) => upsertAssistant(chunk),
        onMeta: (meta) => {
          latestMeta = { ...latestMeta, ...meta };
          setCurrentMeta(prev => ({ ...prev, ...meta }));
          // Update last assistant message with meta if it exists
          if (assistantSoFar) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, meta: latestMeta || undefined } : m));
              }
              return prev;
            });
          }
        },
        onDone: async () => {
          setIsLoading(false);
          setCurrentMeta(null);
          if (assistantSoFar) {
            await supabase.from("chat_messages").insert({
              role: "assistant",
              content: assistantSoFar,
              agent_id: latestMeta?.agent || "secretary",
            });
          }
        },
      });
    } catch (e: any) {
      console.error(e);
      setIsLoading(false);
      setCurrentMeta(null);
      // Mark the last assistant message as failed, or add a failed message
      setMessages(prev => {
        if (prev[prev.length - 1]?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, failed: true, content: m.content || e.message } : m));
        }
        return [...prev, { role: "assistant", content: e.message || "Request failed", timestamp: new Date().toISOString(), failed: true }];
      });
    }
  };

  const handleRetry = () => {
    // Remove the failed message and resend
    setMessages(prev => prev.filter((_, i) => i < prev.length - 1));
    send(lastSentText, true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  // Determine header info from currentMeta or last message meta
  const activeMeta = currentMeta || messages.filter(m => m.role === "assistant").pop()?.meta;

  return (
    <div className="flex flex-col h-[calc(100vh-44px)]">
      {/* ── Chat Header ── */}
      <ChatHeader meta={activeMeta} isLoading={isLoading} />

      {/* ── Running actions bar (when scrolled away) ── */}
      {isLoading && !isAtBottom && currentMeta?.actions && (
        <div className="border-b border-border bg-card/80 backdrop-blur-sm px-4 py-1.5 flex items-center gap-2 overflow-x-auto">
          {currentMeta.actions
            .filter(a => a.status === "running")
            .map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-xs font-mono text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                {a.title}
              </span>
            ))}
        </div>
      )}

      {/* ── Messages ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState onSend={send} />
          ) : (
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  msg={msg}
                  onRetry={msg.failed ? handleRetry : undefined}
                />
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

      {/* ── Floating "agent working" badge ── */}
      {isLoading && currentMeta?.status && currentMeta.status !== "done" && (
        <div className="absolute bottom-24 right-6 z-20 animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="flex items-center gap-2 rounded-full bg-card border border-border shadow-lg px-3 py-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            <span className="text-xs font-mono text-muted-foreground">
              {currentMeta.agentName || currentMeta.agent || "Agent"} is working…
            </span>
          </div>
        </div>
      )}

      {/* ── Code Attachment ── */}
      {codeAttachment && (
        <div className="border-t border-border bg-card/80 px-4 py-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2">
              <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground uppercase">{codeAttachment.language}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{codeAttachment.lineCount} lines</span>
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

      {/* ── Input ── */}
      <form onSubmit={handleSubmit} className="border-t border-border bg-card/50 backdrop-blur-sm p-3">
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
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Sub-components ──

function ChatHeader({ meta, isLoading }: { meta?: StreamMeta | null; isLoading: boolean }) {
  return (
    <div className="shrink-0 h-10 flex items-center justify-between border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 z-20">
      <div className="flex items-center gap-3">
        {/* Agent indicator */}
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Bot className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground">
            {meta?.agentName || "Secretary"}
          </span>
        </div>
        {/* Model label */}
        {meta?.model && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {meta.model}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Category badge */}
        {meta?.category && meta.category !== "chat" && (
          <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full uppercase">
            {meta.category}
          </span>
        )}
        {/* Working pill */}
        {isLoading && meta?.status && meta.status !== "done" && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
            Working…
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <Bot className="h-6 w-6 text-primary" />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground mb-1">Secretary Ready</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Your conversational interface to Mission Control. I route requests, track tasks, and return results.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md">
        {[
          "Make me a presentation about Thailand",
          "Make me a website about me",
          "What's my task status?",
        ].map((q) => (
          <button
            key={q}
            onClick={() => onSend(q)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatMessage({ msg, onRetry }: { msg: Msg; onRetry?: () => void }) {
  const isUser = msg.role === "user";
  const hasToolActions = msg.meta?.actions && msg.meta.actions.length > 0;
  const isFailed = msg.failed;

  // Tool execution card (split layout)
  if (!isUser && hasToolActions) {
    return (
      <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
        <ToolExecutionCard msg={msg} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className={cn(
      "flex animate-in slide-in-from-bottom-2 fade-in duration-300",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm relative group",
        isUser
          ? "bg-primary text-primary-foreground"
          : isFailed
          ? "bg-destructive/10 border border-destructive/20 text-foreground"
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
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1 underline decoration-1 underline-offset-2",
                    isUser ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80"
                  )}
                >
                  {children}
                  <ExternalLink className="h-3 w-3 inline-block" />
                </a>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
                if (isInline) {
                  return <code className="bg-background/20 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
                }
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
        {/* Timestamp */}
        <div className={cn(
          "text-[10px] font-mono mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity",
          isUser ? "text-primary-foreground/50 text-right" : "text-muted-foreground"
        )}>
          {formatTime(msg.timestamp)}
        </div>
        {/* Retry button */}
        {isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Retry Request
          </button>
        )}
      </div>
    </div>
  );
}

function ToolExecutionCard({ msg, onRetry }: { msg: Msg; onRetry?: () => void }) {
  const actions = msg.meta?.actions || [];
  const isDone = actions.every(a => a.status === "done");
  const hasFailed = actions.some(a => a.status === "failed") || msg.failed;

  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden",
      hasFailed ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
    )}>
      {/* Card header */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-2.5 border-b",
        hasFailed ? "border-destructive/20 bg-destructive/5" : "border-border/50 bg-muted/30"
      )}>
        {hasFailed ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        ) : isDone ? (
          <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        )}
        <span className="text-xs font-medium">
          {hasFailed ? "Task failed" : isDone ? "Task finished" : "Agent is working…"}
        </span>
        {msg.meta?.model && (
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
            {msg.meta.model}
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Left: message content */}
        <div className="flex-1 p-4 min-w-0">
          <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline decoration-1 underline-offset-2 hover:text-primary/80">
                    {children}
                    <ExternalLink className="h-3 w-3 inline-block" />
                  </a>
                ),
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
          {hasFailed && onRetry && (
            <button onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors">
              <RotateCcw className="h-3 w-3" />
              Retry Request
            </button>
          )}
          <div className="text-[10px] font-mono text-muted-foreground mt-2">
            {formatTime(msg.timestamp)}
          </div>
        </div>

        {/* Right: action timeline */}
        {actions.length > 0 && (
          <div className="md:w-64 border-t md:border-t-0 md:border-l border-border/50 p-3">
            <div className="space-y-1">
              {actions.map((action, i) => (
                <ActionItem key={i} action={action} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionItem({ action }: { action: TaskAction }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = action.status === "done"
    ? <Check className="h-3 w-3 text-[hsl(var(--success))]" />
    : action.status === "failed"
    ? <AlertTriangle className="h-3 w-3 text-destructive" />
    : <Loader2 className="h-3 w-3 animate-spin text-accent" />;

  const statusLabel = action.status === "done" ? "Done" : action.status === "failed" ? "Failed" : "Running";
  const statusColor = action.status === "done" ? "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10" : action.status === "failed" ? "text-destructive bg-destructive/10" : "text-accent bg-accent/10";

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30">
      <button
        onClick={() => action.output && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <div className="shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-medium text-foreground truncate block">{action.title}</span>
          <span className="text-[10px] font-mono text-muted-foreground">{action.agent}</span>
        </div>
        <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full", statusColor)}>
          {statusLabel}
        </span>
        {action.output && (
          expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && action.output && (
        <div className="px-2.5 pb-2">
          <pre className="text-[10px] font-mono bg-background rounded-md p-2 overflow-x-auto text-muted-foreground border border-border/50 max-h-32 overflow-y-auto">
            {action.output}
          </pre>
        </div>
      )}
    </div>
  );
}
