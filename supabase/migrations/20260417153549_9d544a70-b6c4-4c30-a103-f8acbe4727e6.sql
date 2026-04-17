-- 1. Rebuild ussd_command on pending queue using best-matching delivery_instructions
-- Priority: package > category > provider
UPDATE public.delivery_queue dq
SET ussd_command = 
  REPLACE(
    REPLACE(
      REPLACE(di.code_template, '{receiver_phone}', RIGHT(REGEXP_REPLACE(o.receiver_phone, '\D','','g'), 9)),
      '{cost_price}',
      CASE 
        WHEN p.cost_price = FLOOR(p.cost_price) THEN FLOOR(p.cost_price)::text
        ELSE REPLACE(TO_CHAR(p.cost_price, 'FM999990.00'), '.', '*')
      END
    ),
    '{sim_password}', COALESCE(di.sim_password, '5516')
  )
FROM public.orders o
JOIN public.data_packages_config p ON p.id = o.package_id
JOIN LATERAL (
  SELECT code_template, sim_password
  FROM public.delivery_instructions di2
  WHERE (di2.package_id = p.id)
     OR (di2.category_id = p.category_id AND di2.package_id IS NULL)
     OR (di2.provider_id = p.provider_id AND di2.package_id IS NULL AND di2.category_id IS NULL)
  ORDER BY 
    (di2.package_id = p.id) DESC,
    (di2.category_id = p.category_id) DESC
  LIMIT 1
) di ON true
WHERE dq.order_id = o.id
  AND dq.status = 'pending'
  AND di.code_template IS NOT NULL;

-- 2. Mark active device online if heartbeat within last 5 min
UPDATE public.android_devices
SET status = 'online'
WHERE is_active = true
  AND archived_at IS NULL
  AND last_heartbeat > now() - interval '5 minutes'
  AND status <> 'online';