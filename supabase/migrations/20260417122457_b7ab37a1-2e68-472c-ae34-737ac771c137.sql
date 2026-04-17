CREATE OR REPLACE FUNCTION public.get_featured_packages()
 RETURNS TABLE(id uuid, package_name text, description text, price numeric, data_amount text, provider_name text, logo_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.package_name, p.description, p.price, p.data_amount,
         pr.display_name, pr.logo_url
  FROM public.featured_packages fp
  JOIN public.data_packages_config p ON p.id = fp.package_id
  JOIN public.providers_config pr ON pr.id = p.provider_id
  WHERE fp.is_active = true AND p.is_active = true
  ORDER BY fp.display_order ASC, fp.created_at DESC
  LIMIT 20;
$function$;