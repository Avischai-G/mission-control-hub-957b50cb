CREATE TABLE public.credential_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_meta_id uuid NOT NULL REFERENCES public.credentials_meta(id) ON DELETE CASCADE,
  encrypted_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(credential_meta_id)
);

ALTER TABLE public.credential_values ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_credential_values_updated_at
  BEFORE UPDATE ON public.credential_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();