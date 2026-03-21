-- Normalize Anthropic model IDs to the hyphenated forms used by the setup UI.
-- Earlier seed data used dotted IDs, which do not match the provider catalog.

UPDATE public.model_registry
SET model_id = 'claude-4-5-haiku-20251015',
    display_name = 'Claude 4.5 Haiku'
WHERE model_id = 'claude-4.5-haiku-20251015';

UPDATE public.model_registry
SET model_id = 'claude-4-6-sonnet-20260217',
    display_name = 'Claude 4.6 Sonnet'
WHERE model_id = 'claude-4.6-sonnet-20260217';

UPDATE public.model_registry
SET model_id = 'claude-4-6-opus-20260205',
    display_name = 'Claude 4.6 Opus'
WHERE model_id = 'claude-4.6-opus-20260205';

INSERT INTO public.model_registry (model_id, provider, display_name, model_type, is_active)
VALUES
  ('claude-4-5-haiku-20251015', 'anthropic', 'Claude 4.5 Haiku', 'chat', true),
  ('claude-4-6-sonnet-20260217', 'anthropic', 'Claude 4.6 Sonnet', 'chat', true),
  ('claude-4-6-opus-20260205', 'anthropic', 'Claude 4.6 Opus', 'chat', true)
ON CONFLICT (model_id) DO UPDATE
SET provider = EXCLUDED.provider,
    display_name = EXCLUDED.display_name,
    model_type = EXCLUDED.model_type,
    is_active = true;

UPDATE public.agents
SET model = 'claude-4-5-haiku-20251015'
WHERE agent_id = 'knowledge-curator'
  AND (model IS NULL OR model = 'claude-4.5-haiku-20251015');

UPDATE public.agents
SET model = 'claude-4-6-sonnet-20260217'
WHERE agent_id = 'secretary'
  AND (model IS NULL OR model = 'claude-4.6-sonnet-20260217');
