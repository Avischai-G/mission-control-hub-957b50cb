
-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Folder README index files (context routing layer)
-- These are the tiny files the Context Agent reads to decide what to fetch.
-- Maintained automatically by the Daily Memory Summarizer going forward.
-- ─────────────────────────────────────────────────────────────────────────────

-- Root README
INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'readme-root',
  'knowledge/README.md',
  'readme', 'root',
  'Knowledge Base — Root Index',
  'Root index of all knowledge folders. Maintained automatically by the Daily Memory Summarizer.',
  E'# Knowledge Base\n\n*Maintained automatically by the Daily Memory Summarizer*\n\n## Folders\n\n| Folder | Purpose |\n|---|---|\n| personal/ | Personal information about the user: identity, background, preferences, communication style |\n| development/ | Development instructions, coding standards, active projects, tools |\n| memory-summaries/ | Daily distilled structured facts extracted from conversations |\n\n## How this works\n\nEach folder contains structured knowledge files. The Context Agent reads this README and folder READMEs to route the right knowledge to each agent.',
  80, 1.0, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

-- personal/ README
INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'readme-personal',
  'knowledge/personal/README.md',
  'readme', 'personal',
  'Personal — README',
  'Personal folder: identity, background, preferences, and communication style of the user.',
  E'# Personal\n\nPersonal information about the user.\n\n## Files\n\n| File | Description |\n|---|---|\n| profile.md | Identity, name, location, occupation, background, goals |\n| preferences.md | UI preferences, tool preferences, workflow preferences |\n| communication.md | Communication style, how the user likes to be addressed |\n\n*Updated automatically by the Daily Memory Summarizer*',
  70, 1.0, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

-- development/ README
INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'readme-development',
  'knowledge/development/README.md',
  'readme', 'development',
  'Development — README',
  'Development folder: coding instructions, active projects, and tool preferences for AI agents.',
  E'# Development\n\nDevelopment instructions and project context for AI agents.\n\n## Files\n\n| File | Description |\n|---|---|\n| instructions.md | Coding standards, rules, and constraints explicitly stated by the user |\n| projects.md | Active projects, their stacks, current status, and goals |\n| tools.md | Tools, libraries, and frameworks the user works with |\n\n*Updated automatically by the Daily Memory Summarizer*',
  75, 1.0, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

-- memory-summaries/ README
INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'readme-memory-summaries',
  'knowledge/memory-summaries/README.md',
  'readme', 'memory-summaries',
  'Memory Summaries — README',
  'Daily distilled structured facts from conversations, organized by date.',
  E'# Memory Summaries\n\nDaily structured fact extractions from conversations.\n\nEach file covers one day and contains categorized facts extracted by the Daily Memory Summarizer.\n\n*Created automatically each night at 2am*',
  45, 1.0, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Initial knowledge files (empty templates — filled by summarizer over time)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'knowledge-personal-profile',
  'knowledge/personal/profile.md',
  'personal', 'personal',
  'Personal Profile',
  'Identity, name, location, occupation, background, and goals of the user.',
  E'# Personal Profile\n\n*This file is maintained by the Daily Memory Summarizer. It will be populated as the AI learns from conversations.*\n\n## Identity\n\n(No information yet — will be updated nightly)\n\n## Background\n\n(No information yet)\n\n## Goals\n\n(No information yet)',
  50, 0.5, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'knowledge-personal-preferences',
  'knowledge/personal/preferences.md',
  'personal', 'personal',
  'Preferences',
  'UI preferences, tool preferences, and workflow preferences of the user.',
  E'# Preferences\n\n*Populated automatically by the Daily Memory Summarizer.*\n\n## UI & Design\n\n(No information yet)\n\n## Tools & Workflow\n\n(No information yet)',
  40, 0.5, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'knowledge-dev-instructions',
  'knowledge/development/instructions.md',
  'development', 'development',
  'Development Instructions',
  'Coding standards, rules, constraints, and tech stack decisions stated by the user.',
  E'# Development Instructions\n\n*Populated automatically by the Daily Memory Summarizer.*\n\n## Coding Standards\n\n(No instructions yet)\n\n## Tech Stack Rules\n\n(No instructions yet)',
  40, 0.5, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

INSERT INTO public.knowledge_files (file_id, file_path, domain, subdomain, title, summary, content, word_count, confidence_min, schema_version, is_valid)
VALUES (
  'knowledge-dev-projects',
  'knowledge/development/projects.md',
  'development', 'development',
  'Active Projects',
  'Active projects, their tech stacks, current status, and goals.',
  E'# Active Projects\n\n*Populated automatically by the Daily Memory Summarizer.*\n\n## Projects\n\n(No projects yet)',
  30, 0.5, '1.0', true
) ON CONFLICT (file_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Context Agent
-- Reads README indexes and selects relevant files per agent + query.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.agents (agent_id, name, role, purpose, is_active, capability_tags, instructions_md)
VALUES (
  'context-agent',
  'Context Agent',
  'infrastructure',
  'Routes knowledge to the right agent by reading README indexes and selecting relevant files.',
  true,
  ARRAY['context', 'routing', 'knowledge', 'infrastructure'],
  E'You are the Context Agent. Your sole job is to select the most relevant knowledge files for a given query and target agent.\n\nYou will receive a list of available knowledge files (from README indexes) and must return the file_ids that are most relevant.\n\nROUTING RULES:\n- secretary: always include personal/profile.md and personal/preferences.md. Add development files only if the query is clearly about a project or coding topic.\n- website-agent: personal/profile.md, personal/preferences.md, development/projects.md\n- presentation-agent: personal/profile.md, development/projects.md\n- cron-scheduler: development/instructions.md only\n- For any agent: include memory-summaries files if they contain facts highly relevant to the specific query\n\nSELECTION RULES:\n- Return 2-4 file_ids maximum\n- Only include files that are clearly relevant to the query AND the agent type\n- Skip files that are empty or have no useful content for this specific query\n- Prefer higher-confidence files\n\nReturn ONLY a JSON array: ["file-id-1", "file-id-2"]\nNo explanation. No other text.'
) ON CONFLICT (agent_id) DO NOTHING;

-- Update context-agent instructions if it already existed with old content
UPDATE public.agents
SET instructions_md = E'You are the Context Agent. Your sole job is to select the most relevant knowledge files for a given query and target agent.\n\nYou will receive a list of available knowledge files (from README indexes) and must return the file_ids that are most relevant.\n\nROUTING RULES:\n- secretary: always include personal/profile.md and personal/preferences.md. Add development files only if the query is clearly about a project or coding topic.\n- website-agent: personal/profile.md, personal/preferences.md, development/projects.md\n- presentation-agent: personal/profile.md, development/projects.md\n- cron-scheduler: development/instructions.md only\n- For any agent: include memory-summaries files if they contain facts highly relevant to the specific query\n\nSELECTION RULES:\n- Return 2-4 file_ids maximum\n- Only include files that are clearly relevant to the query AND the agent type\n- Skip files that are empty or have no useful content for this specific query\n- Prefer higher-confidence files\n\nReturn ONLY a JSON array: ["file-id-1", "file-id-2"]\nNo explanation. No other text.'
WHERE agent_id = 'context-agent';
