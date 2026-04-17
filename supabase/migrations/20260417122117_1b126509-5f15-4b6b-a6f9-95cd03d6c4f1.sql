-- 1. Featured packages table
CREATE TABLE IF NOT EXISTS public.featured_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id)
);

ALTER TABLE public.featured_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read featured"
  ON public.featured_packages FOR SELECT
  USING (true);

CREATE POLICY "Admins manage featured"
  ON public.featured_packages FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER featured_packages_updated_at
  BEFORE UPDATE ON public.featured_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.featured_packages;

-- 2. Offline registrations: add is_active column (used by AdminDashboard toggle)
ALTER TABLE public.offline_registrations
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Enable realtime for offline_registrations so admin gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.offline_registrations;