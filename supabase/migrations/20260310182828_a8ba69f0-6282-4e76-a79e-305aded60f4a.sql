
-- API usage logs for tracking token consumption per API call
CREATE TABLE public.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_id text NOT NULL,
  credential_meta_id uuid REFERENCES public.credentials_meta(id) ON DELETE SET NULL,
  tokens_input integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_estimate numeric NOT NULL DEFAULT 0,
  request_type text NOT NULL DEFAULT 'chat',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read api_usage_logs" ON public.api_usage_logs FOR SELECT TO public USING (true);
CREATE POLICY "Public write api_usage_logs" ON public.api_usage_logs FOR INSERT TO public WITH CHECK (true);

-- Provider budgets
CREATE TABLE public.provider_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  budget_amount numeric NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'monthly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read provider_budgets" ON public.provider_budgets FOR SELECT TO public USING (true);
CREATE POLICY "Public write provider_budgets" ON public.provider_budgets FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update provider_budgets" ON public.provider_budgets FOR UPDATE TO public USING (true);
CREATE POLICY "Public delete provider_budgets" ON public.provider_budgets FOR DELETE TO public USING (true);

-- Model catalog with pricing info (updated by weekly cron)
CREATE TABLE public.provider_models_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_id text NOT NULL,
  display_name text NOT NULL,
  input_price_per_1m numeric NOT NULL DEFAULT 0,
  output_price_per_1m numeric NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, model_id)
);

ALTER TABLE public.provider_models_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read provider_models_catalog" ON public.provider_models_catalog FOR SELECT TO public USING (true);
CREATE POLICY "Public write provider_models_catalog" ON public.provider_models_catalog FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update provider_models_catalog" ON public.provider_models_catalog FOR UPDATE TO public USING (true);
CREATE POLICY "Public delete provider_models_catalog" ON public.provider_models_catalog FOR DELETE TO public USING (true);

-- Enable realtime for usage logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.api_usage_logs;
