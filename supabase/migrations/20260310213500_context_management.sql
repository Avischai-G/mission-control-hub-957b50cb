
-- ── 1. Agent-scoped vector search function ──────────────────────────────────
-- Extends the existing search_recent_memory() to filter by agent_id in metadata.
-- This ensures each agent only retrieves its own semantic memory chunks.

CREATE OR REPLACE FUNCTION public.search_agent_memory(
  query_embedding vector(768),
  p_agent_id TEXT,
  match_count INT DEFAULT 5,
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
    AND (r.metadata->>'agent_id' = p_agent_id OR p_agent_id = 'all')
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 2. Seed the daily summarization cron job ────────────────────────────────
-- Runs at 2am every night. Calls summarize-memory Edge Function via cron-execute.

INSERT INTO public.cron_jobs (name, schedule, function_name, is_active, config)
VALUES (
  'Daily Memory Summarizer',
  '0 2 * * *',
  'summarize-memory',
  true,
  '{
    "description": "Summarizes chat messages older than 2 days per agent and stores in knowledge_files. Then deletes the raw messages to keep the DB lean.",
    "builtin": true
  }'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- ── 3. IVFFlat index on recent_memory_chunks for fast cosine search ─────────
-- Only create if not already present. Speeds up vector search significantly.
-- lists=100 is appropriate for up to ~1M rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'recent_memory_chunks'
      AND indexname = 'idx_recent_memory_embedding'
  ) THEN
    CREATE INDEX idx_recent_memory_embedding
      ON public.recent_memory_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

-- ── 4. Add metadata GIN index for fast agent_id filtering ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'recent_memory_chunks'
      AND indexname = 'idx_recent_memory_metadata'
  ) THEN
    CREATE INDEX idx_recent_memory_metadata
      ON public.recent_memory_chunks USING GIN (metadata);
  END IF;
END $$;
