CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id uuid, p_providers text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, order_id uuid, ussd_command text, ussd_code text, package_id uuid, provider_name text, receiver_phone text, sim_slot integer, attempts integer, package_code text, pin_code text, queue_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_queue_id uuid;
BEGIN
  IF p_providers IS NULL OR array_length(p_providers, 1) IS NULL THEN
    SELECT dq.id INTO v_queue_id
    FROM public.delivery_queue dq
    WHERE dq.status = 'pending'
    ORDER BY dq.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  ELSE
    SELECT dq.id INTO v_queue_id
    FROM public.delivery_queue dq
    WHERE dq.status = 'pending'
      AND dq.id IN (
        SELECT dq2.id
        FROM public.delivery_queue dq2
        LEFT JOIN public.data_packages_config p ON p.id = dq2.package_id
        LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
        WHERE dq2.status = 'pending'
          AND (
            LOWER(COALESCE(dq2.provider_name, '')) IN (SELECT LOWER(x) FROM unnest(p_providers) AS x)
            OR LOWER(COALESCE(pr.provider_name, '')) IN (SELECT LOWER(x) FROM unnest(p_providers) AS x)
            OR dq2.package_id IS NULL
          )
      )
    ORDER BY dq.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  END IF;

  IF v_queue_id IS NULL THEN RETURN; END IF;

  UPDATE public.delivery_queue
  SET status = 'processing', claimed_by = p_device_id,
      claimed_at = now(), attempts = COALESCE(attempts, 0) + 1
  WHERE id = v_queue_id;

  RETURN QUERY
  SELECT dq.id, dq.order_id, dq.ussd_command,
    COALESCE(dq.ussd_code, dq.ussd_command),
    dq.package_id,
    COALESCE(dq.provider_name, (SELECT LOWER(pr.provider_name) FROM public.providers_config pr JOIN public.data_packages_config p ON p.provider_id = pr.id WHERE p.id = dq.package_id)),
    COALESCE(dq.receiver_phone, (SELECT o.receiver_phone FROM public.orders o WHERE o.id = dq.order_id)),
    COALESCE(dq.sim_slot, 0),
    COALESCE(dq.attempts, 1),
    dq.package_code, dq.pin_code, dq.id
  FROM public.delivery_queue dq
  WHERE dq.id = v_queue_id;
END $function$;