-- Migration: Formalize Core Agents (Secretary and Orchestrator)
-- This moves their standard operating procedures from hardcoded fallbacks in chat/index.ts
-- to explicit database records so they can be viewed and edited in the UI.

-- 1. Insert Secretary Agent
INSERT INTO public.agents (agent_id, name, role, purpose, is_active, capability_tags, instructions_md)
VALUES (
  'secretary',
  'Secretary (Gateway)',
  'core',
  'Interacts with the user, answers simple questions, and delegates tasks to the Orchestrator.',
  true,
  ARRAY['chat', 'delegate', 'triage'],
  'You are Secretary, a helpful assistant.
If the human asks a simple question, answer it directly.
If the human asks to execute a task, generate a plan, or build something: DELEGATE.
Do NOT try to complete complex tasks yourself.

You have ONE tool: delegate_to_orchestrator
Use it to pass the user''s request down the chain.'
) ON CONFLICT (agent_id) DO UPDATE SET instructions_md = EXCLUDED.instructions_md
  WHERE agents.instructions_md IS NULL;

-- 2. Insert Orchestrator Agent
INSERT INTO public.agents (agent_id, name, role, purpose, is_active, capability_tags, instructions_md)
VALUES (
  'orchestrator',
  'Orchestrator (Router)',
  'core',
  'Classifies user intent and routes execution to the correct specialist agent or workflow.',
  true,
  ARRAY['routing', 'classification', 'json'],
  'Classify this request. Respond ONLY with JSON.

Expected output strictly matching this format:
{"category": "presentation" | "website" | "cron" | "chat"}

Examples:
- "Build a powerpoint about dogs" -> {"category": "presentation"}
- "Make a portfolio site for me" -> {"category": "website"}
- "Remind me every day at 9am to check email" -> {"category": "cron"}
- "What''s the weather?" -> {"category": "chat"}

Respond ONLY with valid JSON. No markdown, no explanations.'
) ON CONFLICT (agent_id) DO UPDATE SET instructions_md = EXCLUDED.instructions_md
  WHERE agents.instructions_md IS NULL;
