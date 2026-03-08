export type Msg = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  failed?: boolean;
  completedTask?: ActiveTask; // inline timeline after completion
};

export type StreamMeta = {
  agent?: string;
  agentName?: string;
  model?: string;
  taskId?: string;
  category?: string;
  status?: string;
  url?: string;
  error?: string;
  actions?: TaskAction[];
};

export type TaskAction = {
  agent: string;
  title: string;
  status: "running" | "done" | "failed";
  output?: string;
};

export type ActiveTask = {
  id: string;
  category: string;
  title: string;
  status: string;
  actions: TaskAction[];
  url?: string;
  error?: string;
  agentName?: string;
  model?: string;
  startedAt: number;
  completedAt?: number;
};

type TaskListener = (tasks: ActiveTask[]) => void;
type CompletedTaskListener = (task: ActiveTask) => void;
let activeTasks: ActiveTask[] = [];
let taskListeners: TaskListener[] = [];
let completedListeners: CompletedTaskListener[] = [];

export function subscribeToTasks(fn: TaskListener): () => void {
  taskListeners.push(fn);
  fn([...activeTasks]);
  return () => { taskListeners = taskListeners.filter(l => l !== fn); };
}

export function subscribeToCompletedTasks(fn: CompletedTaskListener): () => void {
  completedListeners.push(fn);
  return () => { completedListeners = completedListeners.filter(l => l !== fn); };
}

function notifyTaskListeners() {
  const snapshot = [...activeTasks];
  taskListeners.forEach(fn => fn(snapshot));
}

function upsertTask(meta: StreamMeta) {
  const id = meta.taskId || "unknown";
  const existing = activeTasks.find(t => t.id === id);
  if (existing) {
    if (meta.status) existing.status = meta.status;
    if (meta.actions) existing.actions = meta.actions;
    if (meta.url) existing.url = meta.url;
    if (meta.error) existing.error = meta.error;
    if (meta.agentName) existing.agentName = meta.agentName;
    if (meta.model) existing.model = meta.model;

    // If task just completed, notify completed listeners and auto-remove after delay
    if (meta.status === "done" || meta.status === "failed") {
      existing.completedAt = Date.now();
      const completedTask = { ...existing };
      setTimeout(() => {
        completedListeners.forEach(fn => fn(completedTask));
        activeTasks = activeTasks.filter(t => t.id !== id);
        notifyTaskListeners();
      }, 800); // brief pause so user sees the final state
    }
  } else {
    activeTasks.push({
      id,
      category: meta.category || "task",
      title: meta.actions?.[0]?.title || meta.category || "Task",
      status: meta.status || "running",
      actions: meta.actions || [],
      url: meta.url,
      error: meta.error,
      agentName: meta.agentName,
      model: meta.model,
      startedAt: Date.now(),
    });
  }
  notifyTaskListeners();
}

export function clearFinishedTasks() {
  activeTasks = activeTasks.filter(t => t.status !== "done" && t.status !== "failed");
  notifyTaskListeners();
}

export function dismissTask(taskId: string) {
  activeTasks = activeTasks.filter(t => t.id !== taskId);
  notifyTaskListeners();
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export async function streamChat({
  messages,
  onDelta,
  onDone,
  onMeta,
  onError,
}: {
  messages: Msg[];
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onMeta?: (meta: StreamMeta) => void;
  onError?: (error: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) }),
  });

  if (!resp.ok || !resp.body) {
    const errorData = await resp.json().catch(() => ({ error: "Failed to start stream" }));
    throw new Error(errorData.error || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        
        if (parsed.type === "meta") {
          if (parsed.taskId) upsertTask(parsed);
          if (onMeta) onMeta(parsed);
          continue;
        }
        
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.type === "meta") {
          if (parsed.taskId) upsertTask(parsed);
          if (onMeta) onMeta(parsed);
          continue;
        }
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}
