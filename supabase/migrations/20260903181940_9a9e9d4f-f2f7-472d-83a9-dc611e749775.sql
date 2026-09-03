DROP FUNCTION IF EXISTS public.claim_next_delivery(uuid, text[]);

CREATE FUNCTION public.claim_next_delivery(p_device_id uuid, p_providers text[] DEFAULT NULL::text[])
RETURNS TABLE(
  id uuid, order_id uuid, ussd_command text, ussd_code text, package_id uuid,
  provider_name text, receiver_phone text, sim_slot integer, attempts integer,
  package_code text, pin_code text, queue_id uuid,
  discovery_menu_index integer, discovery_menu_label text
)
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
    -- a *212 row is claimable only when the customer's chosen menu index is known,
    -- so the device can select exactly that package (never a blind root dial)
    AND (dq.discovery_session_id IS NULL OR dq.discovery_menu_index IS NOT NULL)
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

CREATE OR REPLACE FUNCTION public.enqueue_discovery_delivery(p_order_id uuid, p_menu_label text, p_menu_index integer DEFAULT NULL::integer, p_session_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_session uuid;
  v_queue_id uuid;
  v_provider text;
  v_pkg_ussd text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  SELECT id INTO v_queue_id FROM public.delivery_queue
  WHERE order_id = p_order_id AND status IN ('pending','claimed','processing')
  LIMIT 1;
  IF v_queue_id IS NOT NULL THEN
    RETURN v_queue_id;
  END IF;

  v_provider := LOWER(COALESCE(
    (SELECT pr.provider_name FROM public.providers_config pr WHERE pr.id = v_order.provider_id),
    'maamuus'
  ));

  -- a *212 order must always be dialed as *212*<receiver># so the menu can be walked
  v_pkg_ussd := '*212*' || v_order.receiver_phone || '#';

  v_session := p_session_id;
  IF v_session IS NULL THEN
    SELECT d.id INTO v_session
    FROM public.ussd_package_discoveries d
    WHERE d.phone_number = v_order.receiver_phone
      AND d.session_state IN ('open','selected','delivering')
      AND d.session_expires_at > now()
    ORDER BY d.updated_at DESC
    LIMIT 1;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.ussd_package_discoveries d
      WHERE d.id = v_session
        AND d.session_state IN ('open','selected','delivering')
        AND d.session_expires_at > now()
    ) THEN
      v_session := NULL;
    END IF;
  END IF;

  INSERT INTO public.delivery_queue (
    order_id, package_id, provider_name, receiver_phone,
    ussd_code, ussd_command, status, execution_order, delay_seconds,
    discovery_session_id, discovery_menu_label, discovery_menu_index
  ) VALUES (
    p_order_id, v_order.package_id, v_provider, v_order.receiver_phone,
    v_pkg_ussd, v_pkg_ussd,
    'pending', 0, 0,
    v_session, p_menu_label, p_menu_index
  ) RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END; $function$;