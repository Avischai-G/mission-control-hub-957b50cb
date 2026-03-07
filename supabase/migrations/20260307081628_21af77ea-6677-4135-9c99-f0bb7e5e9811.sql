
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- AGENTS
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  purpose TEXT NOT NULL,
  model TEXT,
  capability_tags TEXT[] DEFAULT '{}',
  group_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  identity_yaml TEXT,
  instructions_md TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "Public insert agents" ON public.agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update agents" ON public.agents FOR UPDATE USING (true);
CREATE POLICY "Public delete agents" ON public.agents FOR DELETE USING (true);
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AGENT GROUPS
CREATE TABLE public.agent_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  leader_agent_id TEXT,
  parent_group_id UUID REFERENCES public.agent_groups(id),
  max_children INT NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read agent_groups" ON public.agent_groups FOR SELECT USING (true);
CREATE POLICY "Public write agent_groups" ON public.agent_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update agent_groups" ON public.agent_groups FOR UPDATE USING (true);
CREATE POLICY "Public delete agent_groups" ON public.agent_groups FOR DELETE USING (true);

ALTER TABLE public.agents ADD CONSTRAINT fk_agents_group FOREIGN KEY (group_id) REFERENCES public.agent_groups(id);

-- AGENT POLICIES
CREATE TABLE public.agent_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES public.agents(agent_id) ON DELETE CASCADE UNIQUE,
  allowed_models TEXT[] DEFAULT '{}',
  allowed_tools TEXT[] DEFAULT '{}',
  tool_argument_schema JSONB DEFAULT '{}',
  allowed_file_paths_read TEXT[] DEFAULT '{}',
  allowed_file_paths_write TEXT[] DEFAULT '{}',
  allowed_network_domains TEXT[] DEFAULT '{}',
  allowed_delegate_targets TEXT[] DEFAULT '{}',
  max_tool_calls_per_task INT DEFAULT 20,
  max_runtime_ms INT DEFAULT 30000,
  max_output_tokens INT DEFAULT 4096,
  forbidden_actions TEXT[] DEFAULT '{}',
  policy_yaml TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read agent_policies" ON public.agent_policies FOR SELECT USING (true);
CREATE POLICY "Public write agent_policies" ON public.agent_policies FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update agent_policies" ON public.agent_policies FOR UPDATE USING (true);
CREATE POLICY "Public delete agent_policies" ON public.agent_policies FOR DELETE USING (true);

-- TASKS
CREATE TYPE public.task_status AS ENUM (
  'received', 'classified', 'recent_context_ready', 'long_term_context_ready',
  'agent_selected', 'specialist_running', 'specialist_self_check_passed',
  'orchestrator_review_passed', 'final_action_done', 'reported_to_secretary',
  'failed', 'cancelled'
);

CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status public.task_status NOT NULL DEFAULT 'received',
  title TEXT NOT NULL,
  goal TEXT,
  task_type TEXT,
  constraints JSONB DEFAULT '{}',
  context_packet JSONB,
  result JSONB,
  assigned_agent_id TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Public write tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tasks" ON public.tasks FOR UPDATE USING (true);
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TASK CHECKLISTS
CREATE TABLE public.task_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  details TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read task_checklists" ON public.task_checklists FOR SELECT USING (true);
CREATE POLICY "Public write task_checklists" ON public.task_checklists FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update task_checklists" ON public.task_checklists FOR UPDATE USING (true);
CREATE INDEX idx_task_checklists_task_id ON public.task_checklists(task_id);

-- CHAT MESSAGES
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  agent_id TEXT,
  task_id UUID REFERENCES public.tasks(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read chat_messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Public write chat_messages" ON public.chat_messages FOR INSERT WITH CHECK (true);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at DESC);

-- RECENT MEMORY CHUNKS (pgvector)
CREATE TABLE public.recent_memory_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'chat',
  source_id TEXT,
  metadata JSONB DEFAULT '{}',
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recent_memory_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read recent_memory_chunks" ON public.recent_memory_chunks FOR SELECT USING (true);
CREATE POLICY "Public write recent_memory_chunks" ON public.recent_memory_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete recent_memory_chunks" ON public.recent_memory_chunks FOR DELETE USING (true);
CREATE INDEX idx_recent_memory_created ON public.recent_memory_chunks(created_at DESC);

-- KNOWLEDGE FILES (virtual filesystem)
CREATE TABLE public.knowledge_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  file_id TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  subdomain TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  frontmatter JSONB NOT NULL DEFAULT '{}',
  word_count INT NOT NULL DEFAULT 0,
  confidence_min FLOAT DEFAULT 0.5,
  source_refs JSONB DEFAULT '[]',
  related_files TEXT[] DEFAULT '{}',
  owner_agent TEXT,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  is_valid BOOLEAN NOT NULL DEFAULT true,
  validation_errors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read knowledge_files" ON public.knowledge_files FOR SELECT USING (true);
CREATE POLICY "Public write knowledge_files" ON public.knowledge_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update knowledge_files" ON public.knowledge_files FOR UPDATE USING (true);
CREATE POLICY "Public delete knowledge_files" ON public.knowledge_files FOR DELETE USING (true);
CREATE TRIGGER update_knowledge_files_updated_at BEFORE UPDATE ON public.knowledge_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_knowledge_domain ON public.knowledge_files(domain, subdomain);
CREATE INDEX idx_knowledge_valid ON public.knowledge_files(is_valid);

-- KNOWLEDGE CHANGE LOG
CREATE TABLE public.knowledge_change_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'split', 'merged', 'deleted')),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read knowledge_change_log" ON public.knowledge_change_log FOR SELECT USING (true);
CREATE POLICY "Public write knowledge_change_log" ON public.knowledge_change_log FOR INSERT WITH CHECK (true);

-- MODEL REGISTRY
CREATE TABLE public.model_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  model_type TEXT NOT NULL DEFAULT 'chat',
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read model_registry" ON public.model_registry FOR SELECT USING (true);
CREATE POLICY "Public write model_registry" ON public.model_registry FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update model_registry" ON public.model_registry FOR UPDATE USING (true);
CREATE POLICY "Public delete model_registry" ON public.model_registry FOR DELETE USING (true);
CREATE TRIGGER update_model_registry_updated_at BEFORE UPDATE ON public.model_registry FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CREDENTIALS META (no actual secrets)
CREATE TABLE public.credentials_meta (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  credential_type TEXT NOT NULL DEFAULT 'api_key',
  is_set BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credentials_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read credentials_meta" ON public.credentials_meta FOR SELECT USING (true);
CREATE POLICY "Public write credentials_meta" ON public.credentials_meta FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update credentials_meta" ON public.credentials_meta FOR UPDATE USING (true);
CREATE POLICY "Public delete credentials_meta" ON public.credentials_meta FOR DELETE USING (true);

-- MODEL BUDGETS
CREATE TABLE public.model_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id TEXT NOT NULL,
  budget_type TEXT NOT NULL CHECK (budget_type IN ('token', 'cost', 'request')),
  limit_value NUMERIC NOT NULL,
  period TEXT NOT NULL DEFAULT 'daily' CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly')),
  current_usage NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.model_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read model_budgets" ON public.model_budgets FOR SELECT USING (true);
CREATE POLICY "Public write model_budgets" ON public.model_budgets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update model_budgets" ON public.model_budgets FOR UPDATE USING (true);
CREATE POLICY "Public delete model_budgets" ON public.model_budgets FOR DELETE USING (true);
CREATE TRIGGER update_model_budgets_updated_at BEFORE UPDATE ON public.model_budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRON JOBS
CREATE TABLE public.cron_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  schedule TEXT NOT NULL,
  function_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cron_jobs" ON public.cron_jobs FOR SELECT USING (true);
CREATE POLICY "Public write cron_jobs" ON public.cron_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cron_jobs" ON public.cron_jobs FOR UPDATE USING (true);
CREATE TRIGGER update_cron_jobs_updated_at BEFORE UPDATE ON public.cron_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRON JOB RUNS
CREATE TABLE public.cron_job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.cron_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  idempotency_key TEXT UNIQUE,
  checkpoint JSONB
);
ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cron_job_runs" ON public.cron_job_runs FOR SELECT USING (true);
CREATE POLICY "Public write cron_job_runs" ON public.cron_job_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cron_job_runs" ON public.cron_job_runs FOR UPDATE USING (true);
CREATE INDEX idx_cron_job_runs_job_id ON public.cron_job_runs(job_id);

-- LIVE FEED EVENTS
CREATE TABLE public.live_feed_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  agent_id TEXT,
  task_id UUID,
  payload JSONB DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.live_feed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read live_feed_events" ON public.live_feed_events FOR SELECT USING (true);
CREATE POLICY "Public write live_feed_events" ON public.live_feed_events FOR INSERT WITH CHECK (true);
CREATE INDEX idx_live_feed_created ON public.live_feed_events(created_at DESC);
CREATE INDEX idx_live_feed_type ON public.live_feed_events(event_type);

-- NIGHT REPORTS
CREATE TABLE public.night_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  processing_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  files_created INT DEFAULT 0,
  files_updated INT DEFAULT 0,
  files_split INT DEFAULT 0,
  dedup_count INT DEFAULT 0,
  summary TEXT,
  errors TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.night_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read night_reports" ON public.night_reports FOR SELECT USING (true);
CREATE POLICY "Public write night_reports" ON public.night_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update night_reports" ON public.night_reports FOR UPDATE USING (true);

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  actor_agent_id TEXT,
  target_type TEXT,
  target_id TEXT,
  request JSONB,
  result TEXT NOT NULL DEFAULT 'allowed' CHECK (result IN ('allowed', 'denied', 'error')),
  reason TEXT,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read audit_logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Public write audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (true);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- VERIFICATION RUNS
CREATE TABLE public.verification_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  checks JSONB NOT NULL DEFAULT '[]',
  overall_status TEXT NOT NULL DEFAULT 'pending' CHECK (overall_status IN ('pending', 'running', 'passed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.verification_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read verification_runs" ON public.verification_runs FOR SELECT USING (true);
CREATE POLICY "Public write verification_runs" ON public.verification_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update verification_runs" ON public.verification_runs FOR UPDATE USING (true);

-- PGVECTOR SIMILARITY SEARCH FUNCTION
CREATE OR REPLACE FUNCTION public.search_recent_memory(
  query_embedding vector(768),
  match_count INT DEFAULT 10,
  hours_back INT DEFAULT 72
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type TEXT,
  source_id TEXT,
  metadata JSONB,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    r.id, r.content, r.source_type, r.source_id, r.metadata,
    1 - (r.embedding <=> query_embedding) AS similarity,
    r.created_at
  FROM public.recent_memory_chunks r
  WHERE r.created_at > now() - make_interval(hours => hours_back)
    AND r.embedding IS NOT NULL
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
