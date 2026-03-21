-- Remove legacy-row write access from authenticated clients.
-- Legacy null-owned rows remain readable so they can be claimed through
-- authenticated Edge Functions, but direct browser writes now require ownership.

DROP POLICY IF EXISTS "credentials_meta_owner_update" ON public.credentials_meta;
DROP POLICY IF EXISTS "credentials_meta_owner_delete" ON public.credentials_meta;
DROP POLICY IF EXISTS "credential_values_owner_update" ON public.credential_values;
DROP POLICY IF EXISTS "credential_values_owner_delete" ON public.credential_values;
DROP POLICY IF EXISTS "model_registry_owner_update" ON public.model_registry;
DROP POLICY IF EXISTS "model_registry_owner_delete" ON public.model_registry;
DROP POLICY IF EXISTS "cron_job_runs_owner_update" ON public.cron_job_runs;
DROP POLICY IF EXISTS "cron_job_runs_owner_delete" ON public.cron_job_runs;

CREATE POLICY "credentials_meta_owner_update"
  ON public.credentials_meta
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "credentials_meta_owner_delete"
  ON public.credentials_meta
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "credential_values_owner_update"
  ON public.credential_values
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "credential_values_owner_delete"
  ON public.credential_values
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "model_registry_owner_update"
  ON public.model_registry
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "model_registry_owner_delete"
  ON public.model_registry
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "cron_job_runs_owner_update"
  ON public.cron_job_runs
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "cron_job_runs_owner_delete"
  ON public.cron_job_runs
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());
