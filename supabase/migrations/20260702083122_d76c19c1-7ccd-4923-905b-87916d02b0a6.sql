
CREATE TABLE IF NOT EXISTS public.sim_cards_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sim_type text NOT NULL DEFAULT 'STANDARD',
  number text NOT NULL,
  features text DEFAULT '',
  popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  providers jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sim_cards_catalog TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sim_cards_catalog TO authenticated;
GRANT ALL ON public.sim_cards_catalog TO service_role;

ALTER TABLE public.sim_cards_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active sim catalog"
ON public.sim_cards_catalog FOR SELECT
USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert sim catalog"
ON public.sim_cards_catalog FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update sim catalog"
ON public.sim_cards_catalog FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete sim catalog"
ON public.sim_cards_catalog FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_sim_cards_catalog_updated_at
BEFORE UPDATE ON public.sim_cards_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sim_cards_catalog (sim_type, number, features, popular, sort_order, providers) VALUES
('PREPAID', '+252 61 789 4432', '5G Ready • Instant Activation', false, 1,
  '[{"provider":"Hormuud","price":"$2.00","free":false},{"provider":"Somtel","price":"Free","free":true},{"provider":"Somnet","price":"Free","free":true}]'::jsonb),
('GOLD NUMBER', '+252 62 555 0101', 'Premium • 10GB Welcome Data', false, 2,
  '[{"provider":"Somtel","price":"$5.00","free":false},{"provider":"Hormuud","price":"Free","free":true}]'::jsonb),
('STANDARD', '+252 61 953 5029', '4G LTE • Multi-Network', false, 3,
  '[{"provider":"Hormuud","price":"$9.00","free":false},{"provider":"Somtel","price":"Free","free":true},{"provider":"Somnet","price":"Free","free":true}]'::jsonb),
('VIP', '+252 61 111 0000', 'Exclusive Number • Priority Support', true, 4,
  '[{"provider":"Hormuud","price":"$50.00","free":false},{"provider":"Somtel","price":"Free","free":true},{"provider":"Somnet","price":"Free","free":true}]'::jsonb);
