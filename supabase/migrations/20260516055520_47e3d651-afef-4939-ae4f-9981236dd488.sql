
-- 1. Add safe-dispatch columns
ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS ussd_dispatched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_device_id uuid;

CREATE INDEX IF NOT EXISTS idx_delivery_queue_order_status
  ON public.delivery_queue (order_id, status);

CREATE INDEX IF NOT EXISTS idx_delivery_queue_dispatched
  ON public.delivery_queue (dispatched_at)
  WHERE dispatched_at IS NOT NULL;

-- 2. Atomic dispatch marker RPC
CREATE OR REPLACE FUNCTION public.mark_delivery_dispatched(
  p_queue_id uuid,
  p_device_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.delivery_queue
  SET dispatched_at = COALESCE(dispatched_at, now()),
      ussd_dispatched = true,
      dispatch_device_id = COALESCE(dispatch_device_id, p_device_id)
  WHERE id = p_queue_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 3. Update claim_next_delivery: never re-claim a dispatched row
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
    RETURN;
  END IF;

  WITH eligible AS (
    SELECT dq.id AS qid
    FROM public.delivery_queue dq
    LEFT JOIN public.data_packages_config p ON p.id = dq.package_id
    LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
    WHERE dq.status = 'pending'
      AND dq.dispatched_at IS NULL  -- 🛡️ never re-dispatch
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

-- 4. Stuck-delivery recovery (safer): dispatched rows go to verification, never reset to pending
CREATE OR REPLACE FUNCTION public.auto_recover_stuck_deliveries(p_timeout_minutes integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified int := 0;
  v_repended int := 0;
  v_cutoff timestamptz := now() - (p_timeout_minutes || ' minutes')::interval;
BEGIN
  -- Dispatched but stuck → verification_required (admin must verify; never auto-retry)
  WITH upd AS (
    UPDATE public.delivery_queue
    SET status = 'verification_required',
        error_message = COALESCE(error_message, '') ||
          ' [auto-recover: USSD dispatched but no callback after ' || p_timeout_minutes || 'min — needs manual verification]'
    WHERE status = 'processing'
      AND dispatched_at IS NOT NULL
      AND COALESCE(last_attempt_at, claimed_at, created_at) < v_cutoff
    RETURNING id
  )
  SELECT count(*) INTO v_verified FROM upd;

  -- Never-dispatched rows are safe to requeue
  WITH upd2 AS (
    UPDATE public.delivery_queue
    SET status = 'pending',
        android_device_id = NULL,
        claimed_by = NULL,
        claimed_at = NULL,
        error_message = COALESCE(error_message, '') ||
          ' [auto-recover: never dispatched — returned to pending]'
    WHERE status = 'processing'
      AND dispatched_at IS NULL
      AND COALESCE(last_attempt_at, claimed_at, created_at) < v_cutoff
    RETURNING id
  )
  SELECT count(*) INTO v_repended FROM upd2;

  -- Mirror to orders for verification_required
  UPDATE public.orders o
  SET delivery_status = 'verification_required',
      delivery_notes = COALESCE(o.delivery_notes, '') || ' [needs manual verification: USSD dispatched, no callback]'
  WHERE o.id IN (
    SELECT order_id FROM public.delivery_queue
    WHERE status = 'verification_required'
      AND COALESCE(last_attempt_at, claimed_at, created_at) >= now() - interval '1 minute'
  );

  RETURN jsonb_build_object(
    'verification_required', v_verified,
    'repended', v_repended
  );
END;
$$;
