-- Harden sensitive app data behind authenticated ownership.
-- This keeps secrets, model links, and scheduled jobs scoped to the current user
-- instead of globally readable/writable via broad public policies.

-- ── Ownership columns ────────────────────────────────────────────────────────

ALTER TABLE public.credentials_meta
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.credential_values
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.model_registry
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.cron_jobs
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.cron_job_runs
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.credentials_meta
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

ALTER TABLE public.credential_values
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

ALTER TABLE public.model_registry
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

ALTER TABLE public.cron_jobs
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

ALTER TABLE public.cron_job_runs
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_credentials_meta_owner_user_id
  ON public.credentials_meta(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_credential_values_owner_user_id
  ON public.credential_values(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_model_registry_owner_user_id
  ON public.model_registry(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_owner_user_id
  ON public.cron_jobs(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_owner_user_id
  ON public.cron_job_runs(owner_user_id);

-- ── Per-owner uniqueness ─────────────────────────────────────────────────────

ALTER TABLE public.credentials_meta
  DROP CONSTRAINT IF EXISTS credentials_meta_credential_name_key;

ALTER TABLE public.model_registry
  DROP CONSTRAINT IF EXISTS model_registry_model_id_key;

ALTER TABLE public.cron_jobs
  DROP CONSTRAINT IF EXISTS cron_jobs_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS credentials_meta_owner_name_key
  ON public.credentials_meta (
    COALESCE(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    credential_name
  );

CREATE UNIQUE INDEX IF NOT EXISTS model_registry_owner_provider_model_key
  ON public.model_registry (
    COALESCE(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    model_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS cron_jobs_owner_name_key
  ON public.cron_jobs (
    COALESCE(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    name
  );

-- ── Replace public RLS policies on sensitive tables ─────────────────────────

DROP POLICY IF EXISTS "Public read credentials_meta" ON public.credentials_meta;
DROP POLICY IF EXISTS "Public write credentials_meta" ON public.credentials_meta;
DROP POLICY IF EXISTS "Public update credentials_meta" ON public.credentials_meta;
DROP POLICY IF EXISTS "Public delete credentials_meta" ON public.credentials_meta;

DROP POLICY IF EXISTS "Public read model_registry" ON public.model_registry;
DROP POLICY IF EXISTS "Public write model_registry" ON public.model_registry;
DROP POLICY IF EXISTS "Public update model_registry" ON public.model_registry;
DROP POLICY IF EXISTS "Public delete model_registry" ON public.model_registry;

DROP POLICY IF EXISTS "Public read cron_jobs" ON public.cron_jobs;
DROP POLICY IF EXISTS "Public write cron_jobs" ON public.cron_jobs;
DROP POLICY IF EXISTS "Public update cron_jobs" ON public.cron_jobs;

DROP POLICY IF EXISTS "Public read cron_job_runs" ON public.cron_job_runs;
DROP POLICY IF EXISTS "Public write cron_job_runs" ON public.cron_job_runs;
DROP POLICY IF EXISTS "Public update cron_job_runs" ON public.cron_job_runs;

DROP POLICY IF EXISTS "credential_values_owner_select" ON public.credential_values;
DROP POLICY IF EXISTS "credential_values_owner_insert" ON public.credential_values;
DROP POLICY IF EXISTS "credential_values_owner_update" ON public.credential_values;
DROP POLICY IF EXISTS "credential_values_owner_delete" ON public.credential_values;

DROP POLICY IF EXISTS "credentials_meta_owner_select" ON public.credentials_meta;
DROP POLICY IF EXISTS "credentials_meta_owner_insert" ON public.credentials_meta;
DROP POLICY IF EXISTS "credentials_meta_owner_update" ON public.credentials_meta;
DROP POLICY IF EXISTS "credentials_meta_owner_delete" ON public.credentials_meta;

DROP POLICY IF EXISTS "model_registry_owner_select" ON public.model_registry;
DROP POLICY IF EXISTS "model_registry_owner_insert" ON public.model_registry;
DROP POLICY IF EXISTS "model_registry_owner_update" ON public.model_registry;
DROP POLICY IF EXISTS "model_registry_owner_delete" ON public.model_registry;

DROP POLICY IF EXISTS "cron_jobs_owner_select" ON public.cron_jobs;
DROP POLICY IF EXISTS "cron_jobs_owner_insert" ON public.cron_jobs;
DROP POLICY IF EXISTS "cron_jobs_owner_update" ON public.cron_jobs;
DROP POLICY IF EXISTS "cron_jobs_owner_delete" ON public.cron_jobs;

DROP POLICY IF EXISTS "cron_job_runs_owner_select" ON public.cron_job_runs;
DROP POLICY IF EXISTS "cron_job_runs_owner_insert" ON public.cron_job_runs;
DROP POLICY IF EXISTS "cron_job_runs_owner_update" ON public.cron_job_runs;
DROP POLICY IF EXISTS "cron_job_runs_owner_delete" ON public.cron_job_runs;

CREATE POLICY "credentials_meta_owner_select"
  ON public.credentials_meta
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "credentials_meta_owner_insert"
  ON public.credentials_meta
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "credentials_meta_owner_update"
  ON public.credentials_meta
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL)
  WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "credentials_meta_owner_delete"
  ON public.credentials_meta
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "credential_values_owner_select"
  ON public.credential_values
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "credential_values_owner_insert"
  ON public.credential_values
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "credential_values_owner_update"
  ON public.credential_values
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL)
  WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "credential_values_owner_delete"
  ON public.credential_values
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "model_registry_owner_select"
  ON public.model_registry
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "model_registry_owner_insert"
  ON public.model_registry
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "model_registry_owner_update"
  ON public.model_registry
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL)
  WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "model_registry_owner_delete"
  ON public.model_registry
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "cron_jobs_owner_select"
  ON public.cron_jobs
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "cron_jobs_owner_insert"
  ON public.cron_jobs
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "cron_jobs_owner_update"
  ON public.cron_jobs
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "cron_jobs_owner_delete"
  ON public.cron_jobs
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "cron_job_runs_owner_select"
  ON public.cron_job_runs
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "cron_job_runs_owner_insert"
  ON public.cron_job_runs
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "cron_job_runs_owner_update"
  ON public.cron_job_runs
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL)
  WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "cron_job_runs_owner_delete"
  ON public.cron_job_runs
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
