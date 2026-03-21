-- Ensure Q1 2026 optimal models are active in the registry
INSERT INTO model_registry (model_id, provider, display_name, is_active)
VALUES
  ('claude-4.5-haiku-20251015', 'anthropic', 'Claude 4.5 Haiku', true),
  ('claude-4.6-sonnet-20260217', 'anthropic', 'Claude 4.6 Sonnet', true),
  ('gemini-3.1-flash', 'google', 'Gemini 3.1 Flash', true),
  ('deepseek-chat', 'deepseek', 'DeepSeek V3.2 Chat', true)
ON CONFLICT (model_id) DO UPDATE SET is_active = true;

-- Update models in agents table
UPDATE agents SET model = 'claude-4.5-haiku-20251015' WHERE agent_id IN ('orchestrator', 'knowledge-curator');
UPDATE agents SET model = 'claude-4.6-sonnet-20260217'  WHERE agent_id = 'secretary';
UPDATE agents SET model = 'gemini-3.1-flash'           WHERE agent_id = 'context-agent';
UPDATE agents SET model = 'deepseek-chat'              WHERE agent_id IN ('website-agent', 'presentation-agent');

-- Define strict tool allowlists in agent_policies
INSERT INTO agent_policies (agent_id, allowed_tools) VALUES
  ('orchestrator', '{}'),
  ('secretary', '{"web_search", "read_memory_file", "list_user_context"}'),
  ('context-agent', '{}'),
  ('knowledge-curator', '{}'),
  ('website-agent', '{"write_code", "run_terminal", "web_search", "list_user_context"}'),
  ('presentation-agent', '{"write_code", "run_terminal", "web_search", "list_user_context"}')
ON CONFLICT (agent_id) DO UPDATE SET allowed_tools = EXCLUDED.allowed_tools;
