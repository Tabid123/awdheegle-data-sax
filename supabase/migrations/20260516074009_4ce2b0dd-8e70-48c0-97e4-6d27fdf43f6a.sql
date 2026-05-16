CREATE OR REPLACE FUNCTION public.mark_bulk_sms_status(
  p_queue_id uuid,
  p_device_id text,
  p_status text,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_updated int := 0;
BEGIN
  IF v_status IN ('success', 'delivered', 'completed', 'complete', 'done', 'ok') THEN
    v_status := 'sent';
  ELSIF v_status IN ('error', 'failure', 'failed_error', 'undelivered') THEN
    v_status := 'failed';
  END IF;

  IF v_status NOT IN ('sent', 'failed') THEN
    RETURN false;
  END IF;

  UPDATE public.bulk_sms_queue q
  SET status = v_status,
      sent_at = CASE WHEN v_status = 'sent' THEN COALESCE(q.sent_at, now()) ELSE q.sent_at END,
      error = CASE WHEN v_status = 'sent' THEN NULL ELSE COALESCE(p_error_message, q.error) END,
      error_message = CASE WHEN v_status = 'sent' THEN NULL ELSE COALESCE(p_error_message, q.error_message) END
  WHERE q.id = p_queue_id
    AND q.status = 'sending'
    AND q.claimed_at IS NOT NULL
    AND q.device_id = p_device_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_bulk_sms_status(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_bulk_sms_status(uuid, text, text, text) TO anon, authenticated;