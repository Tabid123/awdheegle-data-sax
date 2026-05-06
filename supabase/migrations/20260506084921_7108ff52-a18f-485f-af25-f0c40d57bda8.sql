ALTER TABLE public.auto_topup_phone_mappings
  ADD COLUMN IF NOT EXISTS topup_number_id uuid,
  ADD COLUMN IF NOT EXISTS category_name text;

CREATE INDEX IF NOT EXISTS idx_auto_topup_phone_mappings_topup_number
  ON public.auto_topup_phone_mappings (topup_number_id);