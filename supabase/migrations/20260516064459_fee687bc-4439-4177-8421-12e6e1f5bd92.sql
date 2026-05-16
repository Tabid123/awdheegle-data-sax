-- Normalize device-reported Bulk SMS statuses so successful sends become terminal
CREATE OR REPLACE FUNCTION public.normalize_bulk_sms_queue_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS NOT NULL THEN
    NEW.status := lower(trim(NEW.status));

    IF NEW.status IN ('success', 'delivered', 'completed', 'complete', 'done', 'ok') THEN
      NEW.status := 'sent';
    ELSIF NEW.status IN ('error', 'failure', 'failed_error', 'undelivered') THEN
      NEW.status := 'failed';
    ELSIF NEW.status IN ('processing', 'queued') THEN
      NEW.status := 'sending';
    END IF;
  END IF;

  IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_bulk_sms_queue_status ON public.bulk_sms_queue;
CREATE TRIGGER trg_normalize_bulk_sms_queue_status
BEFORE INSERT OR UPDATE ON public.bulk_sms_queue
FOR EACH ROW EXECUTE FUNCTION public.normalize_bulk_sms_queue_status();

-- Keep campaign counters/status correct after queue status changes
CREATE OR REPLACE FUNCTION public.update_bulk_sms_campaign_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_campaign uuid := COALESCE(NEW.campaign_id, OLD.campaign_id);
  v_sent int;
  v_failed int;
  v_total int;
BEGIN
  IF v_campaign IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    count(*) FILTER (WHERE status = 'sent'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*)
  INTO v_sent, v_failed, v_total
  FROM public.bulk_sms_queue
  WHERE campaign_id = v_campaign;

  UPDATE public.bulk_sms_campaigns
  SET sent_count = v_sent,
      failed_count = v_failed,
      status = CASE
        WHEN v_total = 0 THEN status
        WHEN (v_sent + v_failed) >= v_total THEN
          CASE WHEN v_failed = v_total THEN 'failed'
               WHEN v_failed > 0 THEN 'completed_with_errors'
               ELSE 'completed' END
        ELSE 'sending'
      END,
      completed_at = CASE
        WHEN v_total > 0 AND (v_sent + v_failed) >= v_total THEN COALESCE(completed_at, now())
        ELSE completed_at
      END
  WHERE id = v_campaign;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Allow the Android device to report common success/failure status names; trigger normalizes them
DROP POLICY IF EXISTS "Devices can update bulk sms queue status" ON public.bulk_sms_queue;
CREATE POLICY "Devices can update bulk sms queue status"
ON public.bulk_sms_queue
FOR UPDATE
TO anon
USING (true)
WITH CHECK (
  lower(status) = ANY (ARRAY[
    'pending','sending','sent','failed','queued','processing',
    'success','delivered','completed','complete','done','ok',
    'error','failure','failed_error','undelivered'
  ])
);

GRANT UPDATE (status, error, error_message, sent_at, device_id, sim_slot) ON public.bulk_sms_queue TO anon;

-- Stop already-stuck messages from being picked up again
UPDATE public.bulk_sms_queue
SET status = 'failed',
    error = COALESCE(error, 'Stopped duplicate retry: stale Bulk SMS was halted'),
    error_message = COALESCE(error_message, 'Stopped duplicate retry: stale Bulk SMS was halted'),
    sent_at = COALESCE(sent_at, now())
WHERE status IN ('pending', 'sending', 'queued', 'processing')
  AND created_at < now() - interval '2 minutes';