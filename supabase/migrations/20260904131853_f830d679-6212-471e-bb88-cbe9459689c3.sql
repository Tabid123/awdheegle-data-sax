CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id uuid, p_providers text[] DEFAULT NULL::text[])
RETURNS TABLE(id uuid, order_id uuid, ussd_command text, ussd_code text, package_id uuid, provider_name text, receiver_phone text, sim_slot integer, attempts integer, package_code text, pin_code text, queue_id uuid, discovery_menu_index integer, discovery_menu_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_queue_id uuid;
BEGIN
  IF p_providers IS NULL OR array_length(p_providers, 1) IS NULL THEN RETURN; END IF;

  SELECT dq.id INTO v_queue_id
  FROM public.delivery_queue dq
  WHERE dq.status = 'pending'
    AND dq.dispatched_at IS NULL
    AND COALESCE(dq.attempts, 0) < 3
    AND (dq.scheduled_at IS NULL OR dq.scheduled_at <= now())
    AND dq.provider_name IS NOT NULL
    -- Discovery deliveries must only continue through claim_discovery_selection
    -- on the device that owns the still-open carrier session. Never cold re-dial.
    AND dq.discovery_session_id IS NULL
    AND LOWER(dq.provider_name) IN (SELECT LOWER(x) FROM unnest(p_providers) AS x)
    AND NOT EXISTS (
      SELECT 1 FROM public.android_devices ad
      WHERE ad.is_active AND ad.archived_at IS NULL
        AND ad.primary_for_provider IS NOT NULL
        AND LOWER(ad.primary_for_provider) = LOWER(dq.provider_name)
        AND ad.id <> p_device_id
        AND ad.last_heartbeat > now() - interval '90 seconds'
    )
  ORDER BY dq.created_at ASC
  FOR UPDATE SKIP LOCKED LIMIT 1;

  IF v_queue_id IS NULL THEN RETURN; END IF;

  UPDATE public.delivery_queue dq
  SET status = 'processing', claimed_by = p_device_id, android_device_id = p_device_id,
      claimed_at = now(), last_attempt_at = now(), attempts = COALESCE(dq.attempts, 0) + 1
  WHERE dq.id = v_queue_id;

  RETURN QUERY
  SELECT dq.id, dq.order_id, dq.ussd_command, COALESCE(dq.ussd_code, dq.ussd_command), dq.package_id,
    COALESCE(dq.provider_name, (SELECT LOWER(pr.provider_name) FROM public.providers_config pr JOIN public.data_packages_config p ON p.provider_id = pr.id WHERE p.id = dq.package_id)),
    COALESCE(dq.receiver_phone, (SELECT o.receiver_phone FROM public.orders o WHERE o.id = dq.order_id)),
    GREATEST(COALESCE(dq.sim_slot, 1) - 1, 0),
    COALESCE(dq.attempts, 1), dq.package_code, dq.pin_code, dq.id,
    dq.discovery_menu_index, dq.discovery_menu_label
  FROM public.delivery_queue dq WHERE dq.id = v_queue_id;
END; $function$;

UPDATE public.delivery_queue
SET status = 'verification_required',
    error_message = COALESCE(error_message, 'Discovery session was previously dispatched; manual verification required')
WHERE discovery_session_id IS NOT NULL
  AND status = 'pending'
  AND (dispatched_at IS NOT NULL OR ussd_dispatched = true);