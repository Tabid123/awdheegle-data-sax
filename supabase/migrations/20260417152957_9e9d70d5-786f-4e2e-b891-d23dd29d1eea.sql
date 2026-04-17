-- 1. Update providers_config with phone prefixes and USSD codes
UPDATE public.providers_config 
SET phone_prefixes = ARRAY['61','77','68','69','90'],
    ussd_code = COALESCE(NULLIF(ussd_code,''), '*712*{phone}*{amount}#')
WHERE LOWER(provider_name) LIKE '%hormuud%' OR LOWER(display_name) LIKE '%hormuud%';

UPDATE public.providers_config 
SET phone_prefixes = ARRAY['65','62','58'],
    ussd_code = COALESCE(NULLIF(ussd_code,''), '*222*{phone}*{amount}#')
WHERE LOWER(provider_name) LIKE '%somtel%' OR LOWER(display_name) LIKE '%somtel%';

UPDATE public.providers_config 
SET phone_prefixes = ARRAY['66','79'],
    ussd_code = COALESCE(NULLIF(ussd_code,''), '*770*{phone}*{amount}#')
WHERE LOWER(provider_name) LIKE '%amtel%' OR LOWER(display_name) LIKE '%amtel%';

UPDATE public.providers_config 
SET phone_prefixes = ARRAY['63','71'],
    ussd_code = COALESCE(NULLIF(ussd_code,''), '*555*{phone}*{amount}#')
WHERE LOWER(provider_name) LIKE '%somnet%' OR LOWER(display_name) LIKE '%somnet%';

UPDATE public.providers_config 
SET phone_prefixes = ARRAY['64','67'],
    ussd_code = COALESCE(NULLIF(ussd_code,''), '*888*{phone}*{amount}#')
WHERE LOWER(provider_name) LIKE '%somlink%' OR LOWER(display_name) LIKE '%somlink%';

-- 2. Backfill missing ussd_template on packages from provider's ussd_code
UPDATE public.data_packages_config p
SET ussd_template = pr.ussd_code
FROM public.providers_config pr
WHERE p.provider_id = pr.id
  AND (p.ussd_template IS NULL OR p.ussd_template = '')
  AND pr.ussd_code IS NOT NULL AND pr.ussd_code <> '';

-- 3. Backfill ussd_command on existing pending queue rows
UPDATE public.delivery_queue dq
SET ussd_command = REPLACE(
                     REPLACE(
                       REPLACE(p.ussd_template, '{phone}', o.receiver_phone),
                       '{receiver_phone}', o.receiver_phone
                     ),
                     '{amount}', o.amount::text
                   )
FROM public.orders o, public.data_packages_config p
WHERE dq.order_id = o.id
  AND dq.package_id = p.id
  AND (dq.ussd_command IS NULL OR dq.ussd_command = '')
  AND p.ussd_template IS NOT NULL AND p.ussd_template <> '';

-- Also replace cost_price placeholder with package cost
UPDATE public.delivery_queue dq
SET ussd_command = REPLACE(dq.ussd_command, '{cost_price}', p.cost_price::text)
FROM public.data_packages_config p
WHERE dq.package_id = p.id
  AND dq.ussd_command LIKE '%{cost_price}%';