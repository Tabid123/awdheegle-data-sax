-- Backward-compatible SMS logs fields for Android payloads
ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS sim_slot integer,
  ADD COLUMN IF NOT EXISTS sim_number text,
  ADD COLUMN IF NOT EXISTS sms_type text,
  ADD COLUMN IF NOT EXISTS sms_sender text,
  ADD COLUMN IF NOT EXISTS sms_body text,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS tx_type text,
  ADD COLUMN IF NOT EXISTS tx_id text,
  ADD COLUMN IF NOT EXISTS counterpart_phone text;

CREATE OR REPLACE FUNCTION public.normalize_sms_logs_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.direction := COALESCE(NULLIF(NEW.direction, ''), NULLIF(NEW.sms_type, ''), 'incoming');
  NEW.phone_number := COALESCE(NULLIF(NEW.phone_number, ''), NULLIF(NEW.sms_sender, ''), NULLIF(NEW.counterpart_phone, ''));
  NEW.message := COALESCE(NULLIF(NEW.message, ''), NULLIF(NEW.sms_body, ''));
  NEW.status := COALESCE(NULLIF(NEW.status, ''), 'received');
  NEW.sms_type := COALESCE(NULLIF(NEW.sms_type, ''), NEW.direction);
  NEW.sms_sender := COALESCE(NULLIF(NEW.sms_sender, ''), NEW.phone_number);
  NEW.sms_body := COALESCE(NULLIF(NEW.sms_body, ''), NEW.message);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_sms_logs_columns_before_write ON public.sms_logs;
CREATE TRIGGER normalize_sms_logs_columns_before_write
BEFORE INSERT OR UPDATE ON public.sms_logs
FOR EACH ROW
EXECUTE FUNCTION public.normalize_sms_logs_columns();

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at_desc ON public.sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_device_created ON public.sms_logs (device_id, created_at DESC);

-- Recreate claim_next_delivery so manual/automatic queue rows with sim_slot 1/2 are returned correctly to Android
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id uuid, p_providers text[] DEFAULT NULL::text[])
RETURNS TABLE(
  id uuid,
  order_id uuid,
  ussd_command text,
  ussd_code text,
  package_id uuid,
  provider_name text,
  receiver_phone text,
  sim_slot integer,
  attempts integer,
  package_code text,
  pin_code text,
  queue_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_queue_id uuid;
BEGIN
  WITH eligible AS (
    SELECT dq.id AS qid
    FROM public.delivery_queue dq
    LEFT JOIN public.data_packages_config p ON p.id = dq.package_id
    LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
    WHERE dq.status = 'pending'
      AND (dq.scheduled_at IS NULL OR dq.scheduled_at <= now())
      AND (
        p_providers IS NULL
        OR array_length(p_providers, 1) IS NULL
        OR LOWER(COALESCE(dq.provider_name, '')) IN (SELECT LOWER(x) FROM unnest(p_providers) AS x)
        OR LOWER(COALESCE(pr.provider_name, '')) IN (SELECT LOWER(x) FROM unnest(p_providers) AS x)
        OR dq.package_id IS NULL
      )
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
$$;