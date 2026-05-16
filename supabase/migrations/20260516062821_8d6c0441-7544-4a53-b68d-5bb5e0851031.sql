-- 1. Add error_message column (Android writes to this name)
ALTER TABLE public.bulk_sms_queue
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Keep both error fields in sync
CREATE OR REPLACE FUNCTION public.sync_bulk_sms_error_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.error_message IS NULL AND NEW.error IS NOT NULL THEN NEW.error_message := NEW.error; END IF;
    IF NEW.error IS NULL AND NEW.error_message IS NOT NULL THEN NEW.error := NEW.error_message; END IF;
  ELSE
    IF NEW.error_message IS DISTINCT FROM OLD.error_message AND NEW.error_message IS NOT NULL THEN
      NEW.error := NEW.error_message;
    ELSIF NEW.error IS DISTINCT FROM OLD.error AND NEW.error IS NOT NULL THEN
      NEW.error_message := NEW.error;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bulk_sms_error_aliases ON public.bulk_sms_queue;
CREATE TRIGGER trg_sync_bulk_sms_error_aliases
BEFORE INSERT OR UPDATE ON public.bulk_sms_queue
FOR EACH ROW EXECUTE FUNCTION public.sync_bulk_sms_error_aliases();

-- 2. Trigger that updates campaign counters whenever queue rows change
CREATE OR REPLACE FUNCTION public.update_bulk_sms_campaign_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign uuid := COALESCE(NEW.campaign_id, OLD.campaign_id);
  v_sent int;
  v_failed int;
  v_total int;
BEGIN
  IF v_campaign IS NULL THEN RETURN NEW; END IF;

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
        WHEN v_total > 0 AND (v_sent + v_failed) >= v_total THEN now()
        ELSE completed_at
      END
  WHERE id = v_campaign;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_bulk_sms_campaign_counters ON public.bulk_sms_queue;
CREATE TRIGGER trg_update_bulk_sms_campaign_counters
AFTER INSERT OR UPDATE OR DELETE ON public.bulk_sms_queue
FOR EACH ROW EXECUTE FUNCTION public.update_bulk_sms_campaign_counters();

-- 3. Keep the RPC the Android client calls (no-op now, but avoid 404 errors)
CREATE OR REPLACE FUNCTION public.increment_bulk_sms_counter(p_campaign_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Counters are maintained by trigger; this RPC is kept for backwards compat.
  PERFORM 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_bulk_sms_counter(uuid, text) TO anon, authenticated, service_role;

-- 4. Retry helper: reset failed queue rows to pending and reopen the campaign
CREATE OR REPLACE FUNCTION public.retry_bulk_sms_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH upd AS (
    UPDATE public.bulk_sms_queue
    SET status = 'pending',
        error = NULL,
        error_message = NULL,
        sent_at = NULL
    WHERE campaign_id = p_campaign_id
      AND status = 'failed'
    RETURNING id
  )
  SELECT count(*) INTO v_reset FROM upd;

  RETURN jsonb_build_object('reset', v_reset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.retry_bulk_sms_campaign(uuid) TO authenticated;