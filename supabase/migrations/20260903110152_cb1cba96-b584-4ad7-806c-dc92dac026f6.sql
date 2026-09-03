
ALTER TABLE public.ussd_price_catalog
  ADD COLUMN IF NOT EXISTS root_package_id uuid REFERENCES public.data_packages_config(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ussd_price_catalog_root ON public.ussd_price_catalog(root_package_id);
