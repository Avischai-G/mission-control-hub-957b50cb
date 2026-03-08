
-- Create public storage bucket for generated files
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-files', 'generated-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to generated files
CREATE POLICY "Public read generated-files" ON storage.objects FOR SELECT USING (bucket_id = 'generated-files');

-- Allow anon/service role to insert files
CREATE POLICY "Allow insert generated-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'generated-files');

-- Seed presentation-agent
INSERT INTO public.agents (agent_id, name, role, purpose, is_active, capability_tags, model, instructions_md)
VALUES (
  'presentation-agent',
  'Presentation Agent',
  'specialist',
  'Generates HTML slide presentations on any topic.',
  true,
  ARRAY['presentation', 'slides', 'html'],
  NULL,
  'You are a presentation specialist. When given a topic and slide count, generate a complete, self-contained HTML file with embedded CSS that creates a beautiful slide presentation. Each slide should be a section. Include navigation. Return ONLY the raw HTML code, no markdown fences, no explanation.'
) ON CONFLICT (agent_id) DO NOTHING;

-- Seed website-agent
INSERT INTO public.agents (agent_id, name, role, purpose, is_active, capability_tags, model, instructions_md)
VALUES (
  'website-agent',
  'Website Agent',
  'specialist',
  'Generates single-page HTML websites from knowledge context.',
  true,
  ARRAY['website', 'html', 'portfolio'],
  NULL,
  'You are a website specialist. When given information about a person or topic, generate a complete, self-contained HTML file with embedded CSS that creates a beautiful single-page website. Return ONLY the raw HTML code, no markdown fences, no explanation.'
) ON CONFLICT (agent_id) DO NOTHING;

-- Insert fake knowledge about the user
INSERT INTO public.knowledge_files (file_id, title, domain, subdomain, file_path, content, summary, word_count, is_valid, schema_version)
VALUES (
  'user-profile-001',
  'User Profile - Alex Morgan',
  'personal',
  'biography',
  'knowledge/personal/user-profile.md',
  '---
title: User Profile - Alex Morgan
domain: personal
subdomain: biography
confidence_min: 0.9
---

# Alex Morgan - Personal Profile

## Basic Info
- **Name**: Alex Morgan
- **Location**: Berlin, Germany
- **Occupation**: AI Systems Architect & Full-Stack Developer
- **Languages**: English, German, Spanish

## Professional Background
Alex is a senior AI systems architect with 8 years of experience building intelligent automation platforms. Previously worked at Siemens Digital Industries and a YC-backed startup called NeuralOps. Specializes in multi-agent orchestration systems, LLM integration, and real-time data pipelines.

## Education
- M.Sc. Computer Science, Technical University of Munich (2016)
- B.Sc. Mathematics, University of Heidelberg (2014)

## Skills & Interests
- Expert in Python, TypeScript, Rust
- Deep knowledge of transformer architectures and RAG systems
- Passionate about open-source tooling and developer experience
- Hobbies: rock climbing, photography, building mechanical keyboards

## Contact
- GitHub: github.com/alexmorgan-dev
- Email: alex@morgan-systems.dev
- LinkedIn: linkedin.com/in/alexmorgan-ai',
  'Alex Morgan is an AI Systems Architect based in Berlin with 8 years of experience in multi-agent systems, LLM integration, and real-time pipelines. Previously at Siemens and NeuralOps.',
  150,
  true,
  '1.0'
) ON CONFLICT (file_id) DO NOTHING;
