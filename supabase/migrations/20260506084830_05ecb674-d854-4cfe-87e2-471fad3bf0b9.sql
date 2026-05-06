CREATE TABLE IF NOT EXISTS public.auto_topup_phone_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  package_id uuid NOT NULL,
  custom_amount text,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_topup_phone_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage auto_topup_phone_mappings"
ON public.auto_topup_phone_mappings FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Public read auto_topup_phone_mappings"
ON public.auto_topup_phone_mappings FOR SELECT
USING (true);

CREATE INDEX IF NOT EXISTS idx_auto_topup_phone_mappings_phone
  ON public.auto_topup_phone_mappings (phone_number, is_active);

CREATE TRIGGER update_auto_topup_phone_mappings_updated_at
BEFORE UPDATE ON public.auto_topup_phone_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();