-- Store accepted receiver number lengths per package.
ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS allowed_phone_lengths integer[];

-- Keep the existing public package fields and expose the new validation setting.
DROP FUNCTION IF EXISTS public.get_public_packages(uuid);

CREATE FUNCTION public.get_public_packages(p_provider_id uuid)
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
  sort_order integer,
  allowed_phone_lengths integer[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    p.price AS selling_price,
    p.cost_price,
    p.connection_type_label,
    p.ussd_template AS ussd_code,
    p.ussd_template,
    p.is_active,
    p.is_featured,
    p.sort_order,
    p.allowed_phone_lengths
  FROM public.data_packages_config p
  WHERE p.is_active = true
    AND (p_provider_id IS NULL OR p.provider_id = p_provider_id)
  ORDER BY p.sort_order ASC, p.price ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_packages(uuid) TO anon, authenticated;
