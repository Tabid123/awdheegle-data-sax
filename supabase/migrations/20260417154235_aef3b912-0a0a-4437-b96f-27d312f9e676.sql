-- 1. Abuur sim_balances rows-ka device-yada hada jira oo aan rows-ka u haysan
INSERT INTO public.sim_balances (device_id, sim_slot, provider, balance)
SELECT ad.id, 1, LOWER(ad.sim1_provider), 0
FROM public.android_devices ad
WHERE ad.archived_at IS NULL
  AND ad.sim1_provider IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sim_balances sb 
    WHERE sb.device_id = ad.id AND sb.sim_slot = 1
  );

INSERT INTO public.sim_balances (device_id, sim_slot, provider, balance)
SELECT ad.id, 2, LOWER(ad.sim2_provider), 0
FROM public.android_devices ad
WHERE ad.archived_at IS NULL
  AND ad.sim2_provider IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sim_balances sb 
    WHERE sb.device_id = ad.id AND sb.sim_slot = 2
  );

-- 2. Normaliso sim1_provider/sim2_provider columns ee android_devices si lowercase loogu helo (Hormuud -> hormuud)
UPDATE public.android_devices
SET sim1_provider = LOWER(sim1_provider)
WHERE sim1_provider IS NOT NULL AND sim1_provider <> LOWER(sim1_provider);

UPDATE public.android_devices
SET sim2_provider = LOWER(sim2_provider)
WHERE sim2_provider IS NOT NULL AND sim2_provider <> LOWER(sim2_provider);