BEGIN;
ALTER TABLE public.android_devices ADD COLUMN IF NOT EXISTS sim1_delivery_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.android_devices ADD COLUMN IF NOT EXISTS sim2_delivery_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.data_packages_config ADD COLUMN IF NOT EXISTS allowed_phone_prefixes text[];
COMMENT ON COLUMN public.android_devices.sim1_delivery_enabled IS 'Allow new delivery claims using SIM 1; does not disable incoming SMS or OTP.';
COMMENT ON COLUMN public.android_devices.sim2_delivery_enabled IS 'Allow new delivery claims using SIM 2; does not disable incoming SMS or OTP.';
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
    AND EXISTS (SELECT 1 FROM public.android_devices device WHERE device.id = p_device_id AND device.is_active AND device.archived_at IS NULL AND CASE
      WHEN lower(coalesce(nullif(device.sim1_provider, ''), device.provider_name, '')) = lower(dq.provider_name) THEN device.sim1_delivery_enabled
      WHEN lower(coalesce(device.sim2_provider, '')) = lower(dq.provider_name) THEN device.sim2_delivery_enabled
      ELSE false END)
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
      WHERE ad.is_active AND ad.archived_at IS NULL AND CASE
      WHEN lower(coalesce(nullif(ad.sim1_provider, ''), ad.provider_name, '')) = lower(dq.provider_name) THEN ad.sim1_delivery_enabled
      WHEN lower(coalesce(ad.sim2_provider, '')) = lower(dq.provider_name) THEN ad.sim2_delivery_enabled
      ELSE false END
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
    (SELECT CASE WHEN lower(coalesce(nullif(device.sim1_provider, ''), device.provider_name, '')) = lower(dq.provider_name) THEN 0 ELSE 1 END FROM public.android_devices device WHERE device.id = p_device_id),
    COALESCE(dq.attempts, 1), dq.package_code, dq.pin_code, dq.id,
    dq.discovery_menu_index, dq.discovery_menu_label
  FROM public.delivery_queue dq WHERE dq.id = v_queue_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id uuid)
 RETURNS TABLE(session_id uuid, phone_number text, ussd_code text, menu1_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT d.id INTO v_id FROM public.ussd_package_discoveries d
  WHERE d.status = 'queued' AND d.created_at > now() - interval '3 minutes'
    AND EXISTS (SELECT 1 FROM public.android_devices device WHERE device.id = p_device_id AND device.is_active AND device.archived_at IS NULL AND CASE
      WHEN lower(coalesce(nullif(device.sim1_provider, ''), device.provider_name, '')) = lower(coalesce(d.provider_name, 'hormuud')) THEN device.sim1_delivery_enabled
      WHEN lower(coalesce(device.sim2_provider, '')) = lower(coalesce(d.provider_name, 'hormuud')) THEN device.sim2_delivery_enabled
      ELSE false END)
  ORDER BY d.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  UPDATE public.ussd_package_discoveries
  SET status='dialing', claimed_by=p_device_id, claimed_at=now()
  WHERE id = v_id;
  RETURN QUERY SELECT d.id, d.phone_number,
    COALESCE(d.ussd_code, '*212*'||d.phone_number||'#'), d.menu1_label
  FROM public.ussd_package_discoveries d WHERE d.id = v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.claim_discovery_selection(p_device_id uuid)
 RETURNS TABLE(queue_id uuid, session_id uuid, menu_index integer, discovery_menu_label text, pin_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_q uuid; v_s uuid;
BEGIN
  SELECT dq.id, dq.discovery_session_id INTO v_q, v_s
  FROM public.delivery_queue dq
  JOIN public.ussd_package_discoveries d ON d.id = dq.discovery_session_id
  WHERE dq.status = 'pending' AND dq.ussd_dispatched = false
    AND d.session_state = 'open' AND d.claimed_by = p_device_id
    AND EXISTS (SELECT 1 FROM public.android_devices device WHERE device.id = p_device_id AND device.is_active AND device.archived_at IS NULL AND CASE
      WHEN lower(coalesce(nullif(device.sim1_provider, ''), device.provider_name, '')) = lower(coalesce(dq.provider_name, d.provider_name, 'hormuud')) THEN device.sim1_delivery_enabled
      WHEN lower(coalesce(device.sim2_provider, '')) = lower(coalesce(dq.provider_name, d.provider_name, 'hormuud')) THEN device.sim2_delivery_enabled
      ELSE false END)
    AND d.session_expires_at > now()
  ORDER BY dq.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_q IS NULL THEN RETURN; END IF;

  UPDATE public.ussd_package_discoveries SET session_state='delivering' WHERE id = v_s;
  UPDATE public.delivery_queue
  SET status='claimed', claimed_by=p_device_id, android_device_id=p_device_id, claimed_at=now(),
      attempts = COALESCE(attempts,0)+1
  WHERE id = v_q;

  RETURN QUERY SELECT dq.id, dq.discovery_session_id, dq.discovery_menu_index, dq.discovery_menu_label, dq.pin_code
  FROM public.delivery_queue dq WHERE dq.id = v_q;
END; $function$;

DROP FUNCTION public.get_public_packages(uuid);
CREATE OR REPLACE FUNCTION public.get_public_packages(p_provider_id uuid)
 RETURNS TABLE(id uuid, provider_id uuid, category_id uuid, package_name text, description text, data_amount text, validity_days integer, price numeric, selling_price numeric, cost_price numeric, connection_type_label text, ussd_code text, ussd_template text, is_active boolean, is_featured boolean, sort_order integer, allowed_phone_lengths integer[], allowed_phone_prefixes text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    p.allowed_phone_lengths,
    p.allowed_phone_prefixes
  FROM public.data_packages_config p
  WHERE p.is_active = true
    AND (p_provider_id IS NULL OR p.provider_id = p_provider_id)
  ORDER BY p.sort_order ASC, p.price ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_packages(uuid) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

