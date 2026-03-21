import { supabase } from "@/integrations/supabase/client";

export type Conversation = {
  id: string;
  title: string;
  kind: "random" | "topic";
  topic_key: string | null;
  last_message_at: string;
  archived_at: string | null;
};

function sortConversations(rows: Conversation[]) {
  return [...rows].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "random" ? -1 : 1;
    return new Date(right.last_message_at).getTime() - new Date(left.last_message_at).getTime();
  });
}

export function buildTopicKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "topic";
}

export async function ensureRandomConversation() {
  const { data: existingRandom } = await supabase
    .from("conversations")
    .select("id")
    .eq("kind", "random")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (!existingRandom || existingRandom.length === 0) {
    await supabase.from("conversations").insert({
      kind: "random",
      title: "Random Chat",
      topic_key: "random",
      last_message_at: new Date().toISOString(),
    });
  }
}

export async function fetchConversations() {
  await ensureRandomConversation();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, kind, topic_key, last_message_at, archived_at")
    .is("archived_at", null)
    .order("kind", { ascending: true })
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return sortConversations((data as Conversation[]) || []);
}

async function fetchConversationUsageCounts() {
  const counts = new Map<string, number>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("conversation_id")
      .not("conversation_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = (data as Array<{ conversation_id: string | null }>) || [];
    for (const row of rows) {
      if (!row.conversation_id) continue;
      counts.set(row.conversation_id, (counts.get(row.conversation_id) || 0) + 1);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return counts;
}

export async function fetchDefaultConversationId(conversationsArg?: Conversation[]) {
  const conversations = conversationsArg || await fetchConversations();
  if (conversations.length === 0) return null;

  const usageCounts = await fetchConversationUsageCounts();
  const highestUsage = Math.max(0, ...Array.from(usageCounts.values()));

  if (highestUsage <= 0) {
    return conversations.find((conversation) => conversation.kind === "random")?.id || conversations[0]?.id || null;
  }

  const ranked = [...conversations].sort((left, right) => {
    const usageDelta = (usageCounts.get(right.id) || 0) - (usageCounts.get(left.id) || 0);
    if (usageDelta !== 0) return usageDelta;
    return new Date(right.last_message_at).getTime() - new Date(left.last_message_at).getTime();
  });

  return ranked[0]?.id || null;
}

export async function createTopicConversation(title: string) {
  const trimmedTitle = title.trim();
  const topicKey = buildTopicKey(trimmedTitle);

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      kind: "topic",
      title: trimmedTitle,
      topic_key: topicKey,
      last_message_at: new Date().toISOString(),
    })
    .select("id, title, kind, topic_key, last_message_at, archived_at")
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function promoteConversationToTopic(conversationId: string, title: string) {
  const trimmedTitle = title.trim();
  const topicKey = buildTopicKey(trimmedTitle);

  const { error } = await supabase
    .from("conversations")
    .update({
      kind: "topic",
      title: trimmedTitle,
      topic_key: topicKey,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) throw error;

  await ensureRandomConversation();
  const conversations = await fetchConversations();
  return conversations.find((conversation) => conversation.id === conversationId) || null;
}
