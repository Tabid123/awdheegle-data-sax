CREATE TABLE IF NOT EXISTS public.auto_topup_delivery_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_package_id UUID NOT NULL REFERENCES public.auto_topup_packages(id) ON DELETE CASCADE,
  target_package_id UUID NOT NULL REFERENCES public.auto_topup_packages(id) ON DELETE CASCADE,
  delivery_count INTEGER NOT NULL DEFAULT 1,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  execution_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_topup_delivery_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage auto_topup_delivery_rules" ON public.auto_topup_delivery_rules;
CREATE POLICY "Admins manage auto_topup_delivery_rules"
  ON public.auto_topup_delivery_rules FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Public read auto_topup_delivery_rules" ON public.auto_topup_delivery_rules;
CREATE POLICY "Public read auto_topup_delivery_rules"
  ON public.auto_topup_delivery_rules FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public insert auto_topup_delivery_rules" ON public.auto_topup_delivery_rules;
CREATE POLICY "Public insert auto_topup_delivery_rules"
  ON public.auto_topup_delivery_rules FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public update auto_topup_delivery_rules" ON public.auto_topup_delivery_rules;
CREATE POLICY "Public update auto_topup_delivery_rules"
  ON public.auto_topup_delivery_rules FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Public delete auto_topup_delivery_rules" ON public.auto_topup_delivery_rules;
CREATE POLICY "Public delete auto_topup_delivery_rules"
  ON public.auto_topup_delivery_rules FOR DELETE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_atdr_source ON public.auto_topup_delivery_rules(source_package_id);
CREATE INDEX IF NOT EXISTS idx_atdr_active ON public.auto_topup_delivery_rules(is_active);