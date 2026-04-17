-- =============================================================
-- 1. Compatibility columns on existing tables
-- =============================================================

ALTER TABLE public.providers_config
  ADD COLUMN IF NOT EXISTS promotional_text text,
  ADD COLUMN IF NOT EXISTS evoucher_rate numeric NOT NULL DEFAULT 0;

ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connection_type_label text NOT NULL DEFAULT 'Data',
  ADD COLUMN IF NOT EXISTS category_id uuid;

ALTER TABLE public.banners_config
  ADD COLUMN IF NOT EXISTS alt_text text,
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';

ALTER TABLE public.payment_providers_config
  ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0;

-- =============================================================
-- 2. package_categories table (was missing entirely)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.package_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.providers_config(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  category_image text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.package_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read package categories" ON public.package_categories;
CREATE POLICY "Public read package categories"
ON public.package_categories
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins manage package categories" ON public.package_categories;
CREATE POLICY "Admins manage package categories"
ON public.package_categories
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_package_categories_updated_at ON public.package_categories;
CREATE TRIGGER trg_package_categories_updated_at
BEFORE UPDATE ON public.package_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add foreign key for data_packages_config.category_id (after package_categories exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'data_packages_config_category_id_fkey'
  ) THEN
    ALTER TABLE public.data_packages_config
      ADD CONSTRAINT data_packages_config_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.package_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================
-- 3. Compatibility RPC functions (return both old & new field names)
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS TABLE (
  id uuid,
  provider_name text,
  display_name text,
  provider_logo text,
  logo_url text,
  is_active boolean,
  sort_order integer,
  display_order integer,
  promotional_text text,
  evoucher_rate numeric,
  ussd_code text,
  phone_prefixes text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.provider_name,
    p.display_name,
    p.logo_url           AS provider_logo,
    p.logo_url,
    p.is_active,
    p.sort_order,
    p.sort_order         AS display_order,
    p.promotional_text,
    p.evoucher_rate,
    p.ussd_code,
    p.phone_prefixes
  FROM public.providers_config p
  WHERE p.is_active = true
  ORDER BY p.sort_order ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_active_categories(p_provider_id uuid)
RETURNS TABLE (
  id uuid,
  provider_id uuid,
  category_name text,
  category_image text,
  sort_order integer,
  display_order integer,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.provider_id,
    c.category_name,
    c.category_image,
    c.sort_order,
    c.sort_order AS display_order,
    c.is_active,
    c.created_at,
    c.updated_at
  FROM public.package_categories c
  WHERE c.is_active = true
    AND (p_provider_id IS NULL OR c.provider_id = p_provider_id)
  ORDER BY c.sort_order ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_packages(p_provider_id uuid)
RETURNS TABLE (
  id uuid,
  provider_id uuid,
  category_id uuid,
  package_name text,
  description text,
  data_amount text,
  validity_days integer,
  price numeric,
  selling_price numeric,
  cost_price numeric,
  connection_type_label text,
  ussd_code text,
  ussd_template text,
  is_active boolean,
  is_featured boolean,
  sort_order integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.provider_id,
    p.category_id,
    p.package_name,
    p.description,
    p.data_amount,
    p.validity_days,
    p.price,
    p.price                     AS selling_price,
    p.cost_price,
    p.connection_type_label,
    p.ussd_template             AS ussd_code,
    p.ussd_template,
    p.is_active,
    p.is_featured,
    p.sort_order
  FROM public.data_packages_config p
  WHERE p.is_active = true
    AND (p_provider_id IS NULL OR p.provider_id = p_provider_id)
  ORDER BY p.sort_order ASC, p.price ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_active_payment_providers()
RETURNS TABLE (
  id uuid,
  provider_name text,
  display_name text,
  provider_logo text,
  logo_url text,
  payment_phone text,
  payment_number text,
  ussd_template text,
  commission_rate numeric,
  is_active boolean,
  sort_order integer,
  display_order integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pp.id,
    pp.provider_name,
    pp.display_name,
    pp.logo_url           AS provider_logo,
    pp.logo_url,
    pp.payment_phone,
    pp.payment_phone      AS payment_number,
    pp.ussd_template,
    pp.commission_rate,
    pp.is_active,
    pp.sort_order,
    pp.sort_order         AS display_order
  FROM public.payment_providers_config pp
  WHERE pp.is_active = true
  ORDER BY pp.sort_order ASC;
$$;

-- Update existing get_featured_packages and get_most_purchased_packages
-- so they include logo_url from providers_config as expected by client
CREATE OR REPLACE FUNCTION public.get_featured_packages()
RETURNS TABLE (
  id uuid,
  package_name text,
  description text,
  price numeric,
  data_amount text,
  provider_name text,
  logo_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.package_name, p.description, p.price, p.data_amount,
         pr.display_name, pr.logo_url
  FROM public.data_packages_config p
  JOIN public.providers_config pr ON pr.id = p.provider_id
  WHERE p.is_featured = true AND p.is_active = true
  ORDER BY p.sort_order ASC
  LIMIT 20;
$$;