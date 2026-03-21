-- Claw-style conversations, workspace metadata, calendar fields, and hardened agent security.

-- ── Conversations ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('random', 'topic')),
  title TEXT NOT NULL,
  topic_key TEXT,
  archived_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public write conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public delete conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_owner_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_owner_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_owner_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_owner_delete" ON public.conversations;

CREATE POLICY "conversations_owner_select"
  ON public.conversations
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "conversations_owner_insert"
  ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "conversations_owner_update"
  ON public.conversations
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "conversations_owner_delete"
  ON public.conversations
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_conversations_owner_user_id
  ON public.conversations(owner_user_id, archived_at, last_message_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_owner_random_active_key
  ON public.conversations (COALESCE(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  WHERE kind = 'random' AND archived_at IS NULL;

-- ── Agent ownership + model metadata ────────────────────────────────────────

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.agent_policies
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.model_registry
  ADD COLUMN IF NOT EXISTS context_window_tokens INT,
  ADD COLUMN IF NOT EXISTS default_output_tokens INT;

CREATE INDEX IF NOT EXISTS idx_agents_owner_user_id
  ON public.agents(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_policies_owner_user_id
  ON public.agent_policies(owner_user_id);

DROP POLICY IF EXISTS "Public read agents" ON public.agents;
DROP POLICY IF EXISTS "Public insert agents" ON public.agents;
DROP POLICY IF EXISTS "Public update agents" ON public.agents;
DROP POLICY IF EXISTS "Public delete agents" ON public.agents;
DROP POLICY IF EXISTS "agents_owner_select" ON public.agents;
DROP POLICY IF EXISTS "agents_owner_insert" ON public.agents;
DROP POLICY IF EXISTS "agents_owner_update" ON public.agents;
DROP POLICY IF EXISTS "agents_owner_delete" ON public.agents;

CREATE POLICY "agents_owner_select"
  ON public.agents
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "agents_owner_insert"
  ON public.agents
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "agents_owner_update"
  ON public.agents
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "agents_owner_delete"
  ON public.agents
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Public read agent_policies" ON public.agent_policies;
DROP POLICY IF EXISTS "Public write agent_policies" ON public.agent_policies;
DROP POLICY IF EXISTS "Public update agent_policies" ON public.agent_policies;
DROP POLICY IF EXISTS "Public delete agent_policies" ON public.agent_policies;
DROP POLICY IF EXISTS "agent_policies_owner_select" ON public.agent_policies;
DROP POLICY IF EXISTS "agent_policies_owner_insert" ON public.agent_policies;
DROP POLICY IF EXISTS "agent_policies_owner_update" ON public.agent_policies;
DROP POLICY IF EXISTS "agent_policies_owner_delete" ON public.agent_policies;

CREATE POLICY "agent_policies_owner_select"
  ON public.agent_policies
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "agent_policies_owner_insert"
  ON public.agent_policies
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "agent_policies_owner_update"
  ON public.agent_policies
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "agent_policies_owner_delete"
  ON public.agent_policies
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

-- ── Chat + task ownership, conversation linkage ─────────────────────────────

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_owner_conversation_created
  ON public.chat_messages(owner_user_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_conversation_updated
  ON public.tasks(owner_user_id, conversation_id, updated_at DESC);

DROP POLICY IF EXISTS "Public read chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Public write chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_owner_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_owner_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_owner_update" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_owner_delete" ON public.chat_messages;

CREATE POLICY "chat_messages_owner_select"
  ON public.chat_messages
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "chat_messages_owner_insert"
  ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "chat_messages_owner_update"
  ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "chat_messages_owner_delete"
  ON public.chat_messages
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Public read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Public write tasks" ON public.tasks;
DROP POLICY IF EXISTS "Public update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Public delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "tasks_owner_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_owner_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_owner_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_owner_delete" ON public.tasks;

CREATE POLICY "tasks_owner_select"
  ON public.tasks
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "tasks_owner_insert"
  ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "tasks_owner_update"
  ON public.tasks
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "tasks_owner_delete"
  ON public.tasks
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

DO $$
DECLARE
  legacy_conversation_id UUID;
BEGIN
  INSERT INTO public.conversations (owner_user_id, kind, title, topic_key, last_message_at)
  VALUES (NULL, 'random', 'Random Chat', 'random', now())
  ON CONFLICT DO NOTHING;

  SELECT id
  INTO legacy_conversation_id
  FROM public.conversations
  WHERE owner_user_id IS NULL
    AND kind = 'random'
    AND archived_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF legacy_conversation_id IS NOT NULL THEN
    UPDATE public.chat_messages
    SET conversation_id = legacy_conversation_id
    WHERE conversation_id IS NULL;

    UPDATE public.tasks
    SET conversation_id = legacy_conversation_id
    WHERE conversation_id IS NULL;
  END IF;
END $$;

-- ── Calendar scheduling fields ──────────────────────────────────────────────

ALTER TABLE public.cron_jobs
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
