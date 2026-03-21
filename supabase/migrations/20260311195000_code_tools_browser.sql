-- Code Tools browser catalog and weekly organizer seed

CREATE TABLE public.code_tool_catalog (
  agent_id TEXT PRIMARY KEY REFERENCES public.agents(agent_id) ON DELETE CASCADE,
  folder_path TEXT NOT NULL DEFAULT '',
  tool_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  execution_mode TEXT NOT NULL DEFAULT 'code' CHECK (execution_mode IN ('code', 'hybrid')),
  classification_reason TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.code_tool_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read code_tool_catalog" ON public.code_tool_catalog FOR SELECT USING (true);
CREATE POLICY "Public write code_tool_catalog" ON public.code_tool_catalog FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update code_tool_catalog" ON public.code_tool_catalog FOR UPDATE USING (true);
CREATE POLICY "Public delete code_tool_catalog" ON public.code_tool_catalog FOR DELETE USING (true);
CREATE TRIGGER update_code_tool_catalog_updated_at
BEFORE UPDATE ON public.code_tool_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.code_tool_folder_docs (
  folder_path TEXT PRIMARY KEY,
  folder_name TEXT NOT NULL,
  parent_path TEXT,
  depth INT NOT NULL DEFAULT 0,
  readme_title TEXT NOT NULL,
  readme_content TEXT NOT NULL,
  tool_count INT NOT NULL DEFAULT 0,
  child_folder_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.code_tool_folder_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read code_tool_folder_docs" ON public.code_tool_folder_docs FOR SELECT USING (true);
CREATE POLICY "Public write code_tool_folder_docs" ON public.code_tool_folder_docs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update code_tool_folder_docs" ON public.code_tool_folder_docs FOR UPDATE USING (true);
CREATE POLICY "Public delete code_tool_folder_docs" ON public.code_tool_folder_docs FOR DELETE USING (true);
CREATE TRIGGER update_code_tool_folder_docs_updated_at
BEFORE UPDATE ON public.code_tool_folder_docs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.agents (agent_id, name, role, purpose, is_active, capability_tags, model, instructions_md)
VALUES
  (
    'memory-retriever',
    'Memory Retriever',
    'infrastructure',
    'Searches recent conversation memory chunks for the most relevant context snippets.',
    true,
    ARRAY['memory', 'retrieval', 'context', 'internal-tool'],
    NULL,
    'You are the Memory Retriever. Code-only agent.

PURPOSE: Embed user queries into vectors and search the recent_memory_chunks table for relevant context from the last 72 hours.

WORKFLOW:
1. Receive a query string
2. Generate embedding via configured model
3. Call search_recent_memory() with the embedding
4. Return top matching chunks with similarity scores

This agent does not use an LLM model - it runs deterministic code operations only.'
  ),
  (
    'knowledge-selector',
    'Knowledge Selector',
    'infrastructure',
    'Chooses the most relevant long-term knowledge files for the active task.',
    true,
    ARRAY['knowledge', 'selection', 'context', 'internal-tool'],
    NULL,
    'You are the Knowledge Selector. You pick relevant long-term knowledge files for a given task.

PURPOSE: Given a user request, scan the knowledge_files index and return a list of file_ids that are most relevant.

WORKFLOW:
1. Receive the user query and the knowledge index (titles, summaries, domains)
2. Score each file for relevance
3. Return the top 3-5 file_ids ordered by relevance

RESPONSE FORMAT:
Return a JSON array of file_ids: ["file-001", "file-002"]

Be conservative - only select files that are clearly relevant to the query.'
  ),
  (
    'knowledge-loader',
    'Knowledge Loader',
    'infrastructure',
    'Loads, validates, and trims selected knowledge files into an execution-ready context packet.',
    true,
    ARRAY['knowledge', 'loading', 'context', 'internal-tool'],
    NULL,
    'You are the Knowledge Loader. Code-only agent.

PURPOSE: Open, validate, and trim knowledge files selected by the Knowledge Selector.

WORKFLOW:
1. Receive a list of file_ids from the Knowledge Selector
2. Query knowledge_files table for full content
3. Validate each file (check is_valid, schema_version)
4. Trim content if it exceeds token budget
5. Return assembled context packet

This agent does not use an LLM model - it runs deterministic code operations only.'
  ),
  (
    'agent-picker',
    'Agent Picker',
    'infrastructure',
    'Selects the best specialist agent for a task based on capability tags and constraints.',
    true,
    ARRAY['routing', 'agent-selection', 'internal-tool'],
    NULL,
    'You are the Agent Picker. Code-first agent.

PURPOSE: Given a task type and required capabilities, select the best specialist agent to handle it.

WORKFLOW:
1. Receive task_type, capability requirements, and constraints
2. Query active agents filtered by role = "specialist"
3. Match capability_tags against requirements
4. Check agent policies for compatibility
5. Return the selected agent_id

SELECTION PRIORITY:
1. Exact capability match
2. Most relevant tags
3. Currently active and within budget

This agent primarily runs code logic with minimal LLM usage for edge cases.'
  ),
  (
    'privileged-writer',
    'Privileged Writer',
    'infrastructure',
    'Performs protected write operations after policy validation and authorization checks.',
    true,
    ARRAY['writes', 'security', 'internal-tool'],
    NULL,
    'You are the Privileged Writer. Code-only infrastructure tool.

PURPOSE: Execute write operations that require elevated permissions - database mutations, file system writes, credential updates, and configuration changes.

SECURITY RULES:
1. Only execute writes explicitly authorized by the Orchestrator
2. Validate every write request against the agent_policies table
3. Log all write operations to audit logs
4. Reject any write that lacks proper authorization chain
5. Never expose raw credentials or secrets in outputs

This agent does not use an LLM model - it runs deterministic code operations only.'
  )
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO public.cron_jobs (name, schedule, function_name, is_active, config)
VALUES (
  'Weekly Tool Organizer',
  '0 9 * * 1',
  'organize-code-tools',
  true,
  '{
    "builtin": true,
    "description": "Rebuilds the Tools folder structure, classifies code-only tools, and generates README.md content for every folder.",
    "root_folder": "tools"
  }'::jsonb
)
ON CONFLICT (name) DO NOTHING;
