-- Replace {sim_password} placeholder using delivery_instructions.sim_password
UPDATE public.delivery_queue dq
SET ussd_command = REPLACE(dq.ussd_command, '{sim_password}', COALESCE(di.sim_password, ''))
FROM public.data_packages_config p
LEFT JOIN public.delivery_instructions di 
  ON (di.package_id = p.id OR di.category_id = p.category_id OR di.provider_id = p.provider_id)
 AND di.sim_password IS NOT NULL AND di.sim_password <> ''
WHERE dq.package_id = p.id
  AND dq.ussd_command LIKE '%{sim_password}%';