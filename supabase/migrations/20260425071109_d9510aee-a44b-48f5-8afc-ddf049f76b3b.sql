
-- 1. STRICT provider routing: order kaliya wuxuu aadi karaa device leh provider-ka saxda ah
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id uuid, p_providers text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, order_id uuid, ussd_command text, ussd_code text, package_id uuid, provider_name text, receiver_phone text, sim_slot integer, attempts integer, package_code text, pin_code text, queue_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_id uuid;
BEGIN
  -- STRICT: dalab kaliya wuxuu aadi karaa aalad leh provider-ka saxda ah
  -- Haddii p_providers la siiyay (oo aan madhnayn), waa SHARTI in dq.provider_name uu ku jiro liiska
  IF p_providers IS NULL OR array_length(p_providers, 1) IS NULL THEN
    -- Aaladda ma soo dirin liis providers — wax dalab ah ha siinin
    RETURN;
  END IF;

  WITH eligible AS (
    SELECT dq.id AS qid
    FROM public.delivery_queue dq
    LEFT JOIN public.data_packages_config p ON p.id = dq.package_id
    LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
    WHERE dq.status = 'pending'
      AND (dq.scheduled_at IS NULL OR dq.scheduled_at <= now())
      AND dq.provider_name IS NOT NULL
      AND LOWER(dq.provider_name) IN (SELECT LOWER(x) FROM unnest(p_providers) AS x)
  )
  SELECT dq.id INTO v_queue_id
  FROM public.delivery_queue dq
  WHERE dq.id IN (SELECT qid FROM eligible)
  ORDER BY dq.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.delivery_queue dq
  SET status = 'processing',
      claimed_by = p_device_id,
      android_device_id = p_device_id,
      claimed_at = now(),
      last_attempt_at = now(),
      attempts = COALESCE(dq.attempts, 0) + 1
  WHERE dq.id = v_queue_id;

  RETURN QUERY
  SELECT
    dq.id,
    dq.order_id,
    dq.ussd_command,
    COALESCE(dq.ussd_code, dq.ussd_command),
    dq.package_id,
    COALESCE(dq.provider_name, (SELECT LOWER(pr.provider_name) FROM public.providers_config pr JOIN public.data_packages_config p ON p.provider_id = pr.id WHERE p.id = dq.package_id)),
    COALESCE(dq.receiver_phone, (SELECT o.receiver_phone FROM public.orders o WHERE o.id = dq.order_id)),
    GREATEST(COALESCE(dq.sim_slot, 1) - 1, 0),
    COALESCE(dq.attempts, 1),
    dq.package_code,
    dq.pin_code,
    dq.id
  FROM public.delivery_queue dq
  WHERE dq.id = v_queue_id;
END;
$function$;

-- 2. Cleanup: dalabyo si khaldan loo calaamadiyay 'completed' iyaga oo aan la dirin
-- Calaamadaha qaladka ah: "Receiver Airtime Partner not found", "AWDHEEGLE DATA | ALWAYS ON" (status text)
UPDATE public.delivery_queue
SET status = 'pending',
    claimed_by = NULL,
    android_device_id = NULL,
    claimed_at = NULL,
    completed_at = NULL,
    error_message = 'Reset: wrong SIM routing (Somnet SIM dialed Somtel USSD)',
    provider_response = NULL
WHERE status = 'completed'
  AND (
    provider_response ILIKE '%receiver airtime partner not found%'
    OR (
      provider_response ILIKE '%AWDHEEGLE DATA%'
      AND provider_response NOT ILIKE '%ugu shubtay%'
      AND provider_response NOT ILIKE '%ku shubtay%'
      AND provider_response NOT ILIKE '%transaction id%'
      AND provider_response NOT ILIKE '%successfully sent%'
      AND provider_response NOT ILIKE '%lacagta waa la diray%'
    )
  );

-- 3. Cleanup orders: order-yada xidhiidha la leh queue-yada hagaajiyay
UPDATE public.orders o
SET status = 'pending',
    delivered_at = NULL,
    delivery_notes = COALESCE(delivery_notes, '') || ' [auto-reset: wrong SIM routing]'
WHERE o.id IN (
  SELECT DISTINCT order_id FROM public.delivery_queue
  WHERE status = 'pending'
    AND error_message = 'Reset: wrong SIM routing (Somnet SIM dialed Somtel USSD)'
)
AND o.status = 'completed';
