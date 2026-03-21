import { useState, useRef, useEffect, useCallback, KeyboardEvent, useLayoutEffect } from "react";
import {
  Send, Loader2, RotateCcw, ExternalLink, Copy, CheckCheck,
  Bot, FileCode, X, AlertTriangle, ListChecks, Clock
} from "lucide-react";
import { streamChat, subscribeToTasks, subscribeToCompletedTasks, type Msg, type ActiveTask, type StreamMeta } from "@/lib/chat-stream";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { TaskPanel } from "@/components/chat/TaskPanel";
import { AgentIndicator } from "@/components/chat/AgentIndicator";
import { CompactTimelineExpanded } from "@/components/chat/CompactTimeline";
import { copyLocalArtifact, getLocalArtifact, openLocalArtifact, openSavedWebsite, saveLocalArtifact } from "@/lib/local-artifacts";
import { ContextIndicatorPill } from "@/components/context/ContextIndicatorPill";
import { useSearchParams } from "react-router-dom";
import { fetchDefaultConversationId, fetchConversations, type Conversation } from "@/lib/conversations";

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

type StoredTaskResult = {
  label?: string;
  open_url?: string;
  type?: string;
};

type HistoryTaskRow = {
  id: string;
  created_at: string;
  task_type: string | null;
  title: string;
  result: unknown;
};

function detectArtifactRequestType(text: string): "website" | "presentation" | null {
  const normalized = text.toLowerCase();
  if (/\b(presentation|slides|deck)\b/.test(normalized)) return "presentation";
  if (/\b(website|site|landing page|portfolio)\b/.test(normalized)) return "website";
  return null;
}

function coerceTaskResult(value: unknown): StoredTaskResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as StoredTaskResult;
}

function buildHistoricalCompletedTask(
  taskId: string,
  messageCreatedAt: string,
  taskRow?: HistoryTaskRow,
) {
  const artifact = getLocalArtifact(taskId);
  const result = coerceTaskResult(taskRow?.result);
  const url = typeof result?.open_url === "string" ? result.open_url : artifact?.url;

  if (!artifact && !url) return undefined;

  const timestamp = new Date(taskRow?.created_at ?? messageCreatedAt).getTime();
  const label = artifact?.label
    || (typeof result?.label === "string" ? result.label : null)
    || taskRow?.title
    || "Result";
  const category = artifact?.type
    || (typeof result?.type === "string" ? result.type : null)
    || taskRow?.task_type
    || "task";

  return {
    id: taskId,
    category,
    title: label,
    status: "done",
    actions: [],
    startedAt: timestamp,
    completedAt: timestamp,
    artifact: artifact || undefined,
    url,
  } satisfies ActiveTask;
}

function sanitizeAssistantMessageContent(content: string): string {
  return content
    .replace(/(?:^|\r?\n)\s*📞?\s*tools\.[^\n]*/g, "")
    .replace(/(?:^|\r?\n)\s*\{"tool_calls":[\s\S]*$/g, "")
    .replace(/(?:^|\r?\n)\s*\{"tool_call":[\s\S]*$/g, "")
    .trimEnd();
}

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedConversationId = searchParams.get("conversation");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<Pick<StreamMeta, "agent" | "agentName" | "model" | "contextWindowTokens" | "estimatedUsedTokens" | "defaultOutputTokens"> | null>(null);
  const [isStreaming, setIsStreaming] = useState(false); // true only while secretary text is actively streaming
  const [codeAttachment, setCodeAttachment] = useState<CodeAttachment | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [lastSentText, setLastSentText] = useState("");
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  // Track the message index that the current stream should update
  const streamTargetIdxRef = useRef<number | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const artifactWindowRef = useRef<Window | null>(null);
  const pendingArtifactTaskIdRef = useRef<string | null>(null);
  const openedArtifactTaskIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedHistoryRef = useRef(false);
  const pendingInitialScrollRef = useRef(false);

  useEffect(() => {
    if (!activeConversationId) return;
    if (requestedConversationId === activeConversationId) return;

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("conversation", activeConversationId);
      return next;
    }, { replace: true });
  }, [activeConversationId, requestedConversationId, setSearchParams]);

  // Derived state
  const hasRunningTasks = activeTasks.some(t => t.status !== "done" && t.status !== "failed");
  // Show timeline only when we have a real plan (more than just "classifying")
  const hasPlan = activeTasks.some(t => t.actions.length > 1);
  // Show "agent working" indicator only before plan is ready, and only when tasks exist
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
      maybeOpenArtifact(completedTask);
      setMessages(prev => {
        // Find the assistant message that has this taskId
        const targetIdx = prev.findIndex(m => m.taskId === completedTask.id);
        if (targetIdx !== -1) {
          return prev.map((m, i) => 
            i === targetIdx ? { ...m, completedTask } : m
          );
        }
        // Fallback: find the last assistant message without a completed task
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

  useEffect(() => {
    const loadConversations = async () => {
      const nextConversations = await fetchConversations();
      const defaultConversationId = await fetchDefaultConversationId(nextConversations);
      const resolvedConversation = nextConversations.find((conversation) => conversation.id === requestedConversationId)
        || nextConversations.find((conversation) => conversation.id === defaultConversationId)
        || nextConversations[0]
        || null;

      setConversations(nextConversations);
      setActiveConversationId(resolvedConversation?.id || null);

      if (resolvedConversation && resolvedConversation.id !== requestedConversationId) {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.set("conversation", resolvedConversation.id);
          return next;
        }, { replace: true });
      }
    };

    void loadConversations();
  }, [requestedConversationId, setSearchParams]);

  // Load chat history for the selected conversation
  useEffect(() => {
    if (!activeConversationId) return;

    const load = async () => {
      setHistoryLoaded(false);
      const { data } = await supabase
        .from("chat_messages")
        .select("role, content, created_at, task_id")
        .eq("conversation_id", activeConversationId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
        .limit(200);

      const taskIds = Array.from(new Set((data ?? []).map((message) => message.task_id).filter((taskId): taskId is string => Boolean(taskId))));
      let taskRowsById = new Map<string, HistoryTaskRow>();

      if (taskIds.length > 0) {
        const { data: taskRows } = await supabase
          .from("tasks")
          .select("id, created_at, task_type, title, result")
          .in("id", taskIds);

        taskRowsById = new Map((taskRows ?? []).map((taskRow) => [taskRow.id, taskRow]));
      }

      const nextMessages = (data ?? []).map((m) => ({
        role: m.role as Msg["role"],
        content: m.role === "assistant" ? sanitizeAssistantMessageContent(m.content) : m.content,
        timestamp: m.created_at,
        taskId: m.task_id || undefined,
        completedTask: m.task_id
          ? buildHistoricalCompletedTask(m.task_id, m.created_at, taskRowsById.get(m.task_id))
          : undefined,
      }));

      setMessages(nextMessages);
      setAgentMeta(null);
      pendingInitialScrollRef.current = true;
    };

    void load();
  }, [activeConversationId]);

  useLayoutEffect(() => {
    if (!pendingInitialScrollRef.current) return;

    const scroller = scrollContainerRef.current;
    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
    }

    pendingInitialScrollRef.current = false;
    hasHydratedHistoryRef.current = true;
    setIsAtBottom(true);
    setHistoryLoaded(true);
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (!isAtBottom) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: hasHydratedHistoryRef.current ? "smooth" : "auto",
      block: "end",
    });
  }, [messages, isAtBottom]);

  const ensureArtifactWindow = () => {
    const existing = artifactWindowRef.current;
    if (existing && !existing.closed) return existing;

    const popup = window.open("", "_blank");
    if (popup) {
      popup.document.write(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Preparing result...</title>
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                font-family: system-ui, sans-serif;
                background: #0b1020;
                color: #f7f9fc;
              }
              .card {
                max-width: 32rem;
                padding: 2rem;
                border-radius: 1rem;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
              }
              p { margin: 0.5rem 0 0; color: rgba(247, 249, 252, 0.78); }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Preparing your result</h1>
              <p>This tab will update automatically when the presentation is ready.</p>
            </div>
          </body>
        </html>
      `);
      popup.document.close();
      artifactWindowRef.current = popup;
    }

    return popup;
  };

  const maybeOpenArtifact = (task?: Pick<ActiveTask, "id" | "artifact">) => {
    if (
      !task?.id
      || !task.artifact
      || task.artifact.type !== "presentation"
      || openedArtifactTaskIdsRef.current.has(task.id)
    ) return;

    saveLocalArtifact(task.artifact);
    const popup = openLocalArtifact(
      task.artifact.id,
      artifactWindowRef.current && !artifactWindowRef.current.closed ? artifactWindowRef.current : undefined
    );

    if (popup) popup.focus();

    openedArtifactTaskIdsRef.current.add(task.id);
    artifactWindowRef.current = null;
    pendingArtifactTaskIdRef.current = null;
  };

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
    if (!activeConversationId) return;
    // Don't block if a background task is running - only block if actively streaming secretary response
    if (isStreaming) return;

    let fullContent = finalText;
    if (codeAttachment) {
      fullContent += (finalText ? "\n\n" : "") + "```" + codeAttachment.language + "\n" + codeAttachment.code + "\n```";
    }

    if (detectArtifactRequestType(fullContent) === "presentation") {
      ensureArtifactWindow();
      pendingArtifactTaskIdRef.current = null;
    }

    const userMsg: Msg = { role: "user", content: fullContent, timestamp: new Date().toISOString() };
    if (!retrying) setMessages(prev => [...prev, userMsg]);
    setInput("");
    setCodeAttachment(null);
    setIsStreaming(true);
    setLastSentText(fullContent);
    setIsAtBottom(true);
    setAgentMeta(null);
    currentTaskIdRef.current = null;
    streamTargetIdxRef.current = null;

    let assistantSoFar = "";
    let secretaryDone = false;

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const content = sanitizeAssistantMessageContent(assistantSoFar);

      setMessages(prev => {
        // If we already have a target index, update that specific message
        if (streamTargetIdxRef.current !== null && streamTargetIdxRef.current < prev.length) {
          return prev.map((m, i) => 
            i === streamTargetIdxRef.current ? { ...m, content } : m
          );
        }
        // Otherwise, check if the last message is our streaming assistant message
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.failed && !last.completedTask) {
          streamTargetIdxRef.current = prev.length - 1;
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
        }
        // Create new assistant message
        const newIdx = prev.length;
        streamTargetIdxRef.current = newIdx;
        return [...prev, { role: "assistant", content, timestamp: new Date().toISOString(), taskId: currentTaskIdRef.current || undefined }];
      });
    };

    const handleMeta = (meta: StreamMeta) => {
      if (meta.agentName || meta.model || meta.estimatedUsedTokens || meta.contextWindowTokens) {
        setAgentMeta((current) => ({
          ...(current || {}),
          agent: meta.agent || current?.agent,
          agentName: meta.agentName || current?.agentName,
          model: meta.model || current?.model,
          contextWindowTokens: meta.contextWindowTokens ?? current?.contextWindowTokens,
          estimatedUsedTokens: meta.estimatedUsedTokens ?? current?.estimatedUsedTokens,
          defaultOutputTokens: meta.defaultOutputTokens ?? current?.defaultOutputTokens,
        }));
      }

      // When we get the first meta with a taskId, the secretary has acknowledged.
      // Allow user to continue chatting.
      if (meta.taskId && !currentTaskIdRef.current) {
        currentTaskIdRef.current = meta.taskId;
        if (meta.category === "presentation") {
          pendingArtifactTaskIdRef.current = meta.taskId;
        }
        // Tag the existing assistant message with this taskId
        setMessages(prev => {
          if (streamTargetIdxRef.current !== null && streamTargetIdxRef.current < prev.length) {
            return prev.map((m, i) => 
              i === streamTargetIdxRef.current ? { ...m, taskId: meta.taskId } : m
            );
          }
          return prev;
        });
      }

      // When we get a plan (actions > 1), secretary text streaming is done - unlock chat
      if (meta.actions && meta.actions.length > 1 && !secretaryDone) {
        secretaryDone = true;
        setIsStreaming(false);
      }

      if (meta.artifact) {
        saveLocalArtifact(meta.artifact);
      }

      if (meta.status === "done") {
        maybeOpenArtifact({ id: meta.taskId || "", artifact: meta.artifact });
      }

      if (meta.status === "failed" && pendingArtifactTaskIdRef.current === meta.taskId) {
        const popup = artifactWindowRef.current;
        if (popup && !popup.closed) {
          popup.document.body.innerHTML = `<div style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#170b0b;color:#f7f9fc"><div style="max-width:32rem;padding:2rem;border-radius:1rem;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12)"><h1>Generation failed</h1><p style="color:rgba(247,249,252,0.78)">${meta.error || "The task did not finish successfully."}</p></div></div>`;
        }
        artifactWindowRef.current = null;
        pendingArtifactTaskIdRef.current = null;
      }
    };

    try {
      const allMsgs = [...(retrying ? messages : [...messages, userMsg])].filter(m => !m.failed);
      await streamChat({
        conversationId: activeConversationId,
        messages: allMsgs,
        onDelta: upsertAssistant,
        onMeta: handleMeta,
        onDone: async () => {
          setIsStreaming(false);
          void refreshConversations();
          if (!currentTaskIdRef.current && artifactWindowRef.current && !artifactWindowRef.current.closed) {
            artifactWindowRef.current.close();
            artifactWindowRef.current = null;
          }
        },
      });
    } catch (e: any) {
      setIsStreaming(false);
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

  const refreshConversations = useCallback(async () => {
    const nextConversations = await fetchConversations();
    setConversations(nextConversations);
    return nextConversations;
  }, []);

  const chatCanvasStyle = {
    maxWidth: showPanel ? "84rem" : undefined,
    transform: showPanel ? "scale(0.975)" : "scale(1)",
    transformOrigin: "top center" as const,
  };

  return (
    <div className="flex h-[calc(100vh-44px)] min-w-0 overflow-hidden text-[15px] md:text-base lg:text-[17px]">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {/* Messages */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden",
            historyLoaded ? "scroll-smooth" : "invisible pointer-events-none"
          )}
          data-chat-scroll="true"
          onScroll={handleScroll}
        >
          <div className="px-4 py-6 md:px-6 lg:px-8">
            <div
              className="mx-auto w-full transition-[max-width,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
              style={chatCanvasStyle}
            >
              {messages.length === 0 ? (
                <EmptyState onSend={send} />
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <ChatMessage key={i} msg={msg} onRetry={msg.failed ? handleRetry : undefined} />
                  ))}
                  {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
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
        </div>

        {(agentMeta?.estimatedUsedTokens || isStreaming) && (
          <div className="pointer-events-none shrink-0 px-4 pb-2 md:px-6 lg:px-8">
            <div
              className="mx-auto flex w-full justify-end transition-[max-width,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
              style={chatCanvasStyle}
            >
              <div className="pointer-events-auto flex items-center gap-2">
                {agentMeta?.estimatedUsedTokens && agentMeta.contextWindowTokens && !agentMeta?.agentName ? (
                  <ContextIndicatorPill
                    usedTokens={agentMeta.estimatedUsedTokens}
                    windowTokens={agentMeta.contextWindowTokens}
                  />
                ) : null}
                {isStreaming && !showIndicator ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3 py-1 text-[10px] font-mono text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-accent" />
                    Responding…
                  </span>
                ) : null}
                <AgentIndicator
                  visible={showIndicator || Boolean(agentMeta?.agentName && isStreaming)}
                  agentName={showIndicator ? currentAgentName : agentMeta?.agentName}
                  estimatedUsedTokens={agentMeta?.estimatedUsedTokens}
                  contextWindowTokens={agentMeta?.contextWindowTokens}
                />
              </div>
            </div>
          </div>
        )}

        {/* Code Attachment */}
        {codeAttachment && (
          <div className="border-t border-border bg-card/80 px-4 py-2">
            <div
              className="mx-auto w-full transition-[max-width,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
              style={chatCanvasStyle}
            >
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

        {/* Input — never disabled, only blocked during active secretary streaming */}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-border bg-card/50 backdrop-blur-sm p-3">
          <div
            className="mx-auto flex w-full items-end gap-2 transition-[max-width,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
            style={chatCanvasStyle}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Message…"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-border bg-secondary/50 px-4 py-3 text-[15px] md:text-base lg:text-[17px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow duration-300 font-[var(--font-display)]"
              style={{ maxHeight: 200 }}
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={(!input.trim() && !codeAttachment) || isStreaming}
              className={cn(
                "shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>

      {/* ── TASK PANEL — no right border line ── */}
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
      <h2 className="font-display text-xl font-semibold text-foreground mb-2">Secretary Ready</h2>
      <p className="max-w-xl text-base text-muted-foreground">
        Always available. I handle quick questions directly and delegate bigger tasks to specialists — you can keep chatting.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 justify-center max-w-2xl">
        {["Make me a presentation about Thailand", "Make me a website about me", "Who am I?"].map(q => (
          <button key={q} onClick={() => onSend(q)}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageTimestamp({ timestamp, isUser, className }: { timestamp?: string; isUser: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "mt-2 text-[11px] font-mono leading-none",
        isUser ? "text-right text-primary-foreground/60" : "text-muted-foreground",
        className
      )}
    >
      {formatTime(timestamp)}
    </div>
  );
}

function ChatMessage({ msg, onRetry }: { msg: Msg; onRetry?: () => void }) {
  const isUser = msg.role === "user";
  const isFailed = msg.failed;
  const isArtifactResult = !isUser && Boolean(msg.completedTask?.artifact || msg.completedTask?.url);

  return (
    <div className={cn("flex w-full flex-col gap-1.5 animate-in slide-in-from-bottom-2 fade-in duration-500", isUser ? "items-end" : "items-start")}>
      <div className={cn(
        "relative w-fit max-w-[92ch] break-words rounded-[1.35rem] px-4 py-3 md:px-5",
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
        {!isArtifactResult && (
          <div className="prose prose-base dark:prose-invert max-w-none text-[15px] leading-7 md:text-base lg:text-[17px] [&_p]:mb-1 [&_p:last-child]:mb-0">
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
                  if (isInline) return <code className="rounded bg-background/20 px-1 py-0.5 text-[0.9em] font-mono">{children}</code>;
                  return (
                    <pre className="my-2 overflow-hidden rounded-lg border border-border/50 bg-background/80 p-3 whitespace-pre-wrap break-words">
                      <code className="text-[0.9em] font-mono whitespace-pre-wrap break-words">{children}</code>
                    </pre>
                  );
                },
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
        {!isArtifactResult && <MessageTimestamp timestamp={msg.timestamp} isUser={isUser} />}
        {isFailed && onRetry && (
          <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors duration-300">
            <RotateCcw className="h-3 w-3" /> Retry Request
          </button>
        )}
        {!isUser && msg.completedTask && (
          (msg.completedTask.artifact || msg.completedTask.url)
            ? <ArtifactActions task={msg.completedTask} />
            : <TimelineToggle task={msg.completedTask} />
        )}
        {isArtifactResult && <MessageTimestamp timestamp={msg.timestamp} isUser={isUser} className="mt-2.5" />}
      </div>
    </div>
  );
}

function ArtifactActions({ task }: { task: ActiveTask }) {
  const [copied, setCopied] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const artifact = task.artifact;
  const isWebsite = (artifact?.type ?? task.category) === "website";
  const websiteUrl = task.url || artifact?.url;

  if (!artifact && !websiteUrl) return null;

  const openLabel = isWebsite ? "Open Website" : "Open Presentation";

  const handleOpen = async () => {
    setOpenError(null);

    if (isWebsite && websiteUrl) {
      setIsOpening(true);
      try {
        await openSavedWebsite(websiteUrl);
      } catch (error) {
        setOpenError(error instanceof Error ? error.message : "Unable to open the saved website.");
      } finally {
        setIsOpening(false);
      }
      return;
    }

    if (artifact) {
      openLocalArtifact(artifact.id);
    }
  };

  const handleCopy = async () => {
    if (!artifact) return;
    const ok = await copyLocalArtifact(artifact.id).catch(() => false);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        onClick={() => void handleOpen()}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {isOpening ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
        {isOpening ? "Opening..." : openLabel}
      </button>
      {!isWebsite && artifact && (
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
        >
          {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      {openError && (
        <span className="self-center text-xs text-destructive">
          {openError}
        </span>
      )}
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
