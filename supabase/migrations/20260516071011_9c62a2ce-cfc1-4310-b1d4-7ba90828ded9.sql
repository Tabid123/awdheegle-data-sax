-- Restore Bulk SMS trigger wiring and remove the failing claim-on-read RLS side effect.
-- Supabase/PostgREST runs GET requests in read-only transactions, so an UPDATE inside
-- a SELECT policy prevents devices from reading pending SMS at all.

CREATE OR REPLACE FUNCTION public.sync_bulk_sms_campaign_recipient_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  v_count := GREATEST(COALESCE(NEW.total_recipients, 0), COALESCE(NEW.recipient_count, 0));
  NEW.total_recipients := v_count;
  NEW.recipient_count := v_count;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bulk_sms_campaign_recipient_counts ON public.bulk_sms_campaigns;
CREATE TRIGGER trg_sync_bulk_sms_campaign_recipient_counts
BEFORE INSERT OR UPDATE ON public.bulk_sms_campaigns
FOR EACH ROW EXECUTE FUNCTION public.sync_bulk_sms_campaign_recipient_counts();

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

  IF NEW.status = 'sent' THEN
    NEW.error := NULL;
    NEW.error_message := NULL;
  ELSIF NEW.status = 'failed' THEN
    NEW.error_message := COALESCE(NEW.error_message, NEW.error);
    NEW.error := COALESCE(NEW.error, NEW.error_message);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_bulk_sms_queue_status ON public.bulk_sms_queue;
CREATE TRIGGER trg_normalize_bulk_sms_queue_status
BEFORE INSERT OR UPDATE ON public.bulk_sms_queue
FOR EACH ROW EXECUTE FUNCTION public.normalize_bulk_sms_queue_status();

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
  v_done int;
BEGIN
  IF v_campaign IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'sent'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*)
  INTO v_sent, v_failed, v_total
  FROM public.bulk_sms_queue
  WHERE campaign_id = v_campaign;

  v_done := v_sent + v_failed;

  UPDATE public.bulk_sms_campaigns
  SET sent_count = v_sent,
      failed_count = v_failed,
      total_recipients = GREATEST(COALESCE(total_recipients, 0), v_total),
      recipient_count = GREATEST(COALESCE(recipient_count, 0), v_total),
      status = CASE
        WHEN v_total = 0 THEN CASE WHEN status = 'sending' THEN 'completed' ELSE status END
        WHEN v_done >= v_total THEN
          CASE
            WHEN v_failed = v_total THEN 'failed'
            WHEN v_failed > 0 THEN 'completed_with_errors'
            ELSE 'completed'
          END
        ELSE 'sending'
      END,
      completed_at = CASE
        WHEN v_total = 0 AND status = 'sending' THEN COALESCE(completed_at, now())
        WHEN v_total > 0 AND v_done >= v_total THEN COALESCE(completed_at, now())
        ELSE NULL
      END
  WHERE id = v_campaign;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_bulk_sms_campaign_counters ON public.bulk_sms_queue;
CREATE TRIGGER trg_update_bulk_sms_campaign_counters
AFTER INSERT OR UPDATE OR DELETE ON public.bulk_sms_queue
FOR EACH ROW EXECUTE FUNCTION public.update_bulk_sms_campaign_counters();

CREATE OR REPLACE FUNCTION public.sync_bulk_sms_error_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
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

-- Preferred API for Android: atomically claim one SMS and return it exactly once.
CREATE OR REPLACE FUNCTION public.claim_next_bulk_sms(p_device_id text DEFAULT NULL, p_sim_slot integer DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  campaign_id uuid,
  phone_number text,
  message text,
  device_id text,
  sim_slot integer,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_queue_id uuid;
BEGIN
  SELECT q.id INTO v_queue_id
  FROM public.bulk_sms_queue q
  JOIN public.bulk_sms_campaigns c ON c.id = q.campaign_id
  WHERE q.status = 'pending'
    AND c.status IN ('pending', 'sending')
    AND (p_device_id IS NULL OR q.device_id IS NULL OR q.device_id = p_device_id)
    AND (p_sim_slot IS NULL OR q.sim_slot IS NULL OR q.sim_slot = p_sim_slot)
  ORDER BY q.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.bulk_sms_queue q
  SET status = 'sending',
      device_id = COALESCE(p_device_id, q.device_id),
      sim_slot = COALESCE(p_sim_slot, q.sim_slot),
      sent_at = NULL,
      error = NULL,
      error_message = NULL
  WHERE q.id = v_queue_id;

  RETURN QUERY
  SELECT q.id, q.campaign_id, q.phone_number, c.message, q.device_id, q.sim_slot, q.status, q.created_at
  FROM public.bulk_sms_queue q
  JOIN public.bulk_sms_campaigns c ON c.id = q.campaign_id
  WHERE q.id = v_queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_bulk_sms(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_bulk_sms(text, integer) TO anon;

GRANT SELECT ON public.bulk_sms_queue TO anon;
GRANT UPDATE (status, error, error_message, sent_at, device_id, sim_slot) ON public.bulk_sms_queue TO anon;
GRANT SELECT ON public.bulk_sms_campaigns TO anon;

DROP POLICY IF EXISTS "Devices can read pending bulk sms queue" ON public.bulk_sms_queue;
CREATE POLICY "Devices can read pending bulk sms queue"
ON public.bulk_sms_queue
FOR SELECT
TO anon
USING (
  status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.bulk_sms_campaigns c
    WHERE c.id = bulk_sms_queue.campaign_id
      AND c.status IN ('pending', 'sending')
  )
);

DROP POLICY IF EXISTS "Devices can update bulk sms queue status" ON public.bulk_sms_queue;
CREATE POLICY "Devices can update bulk sms queue status"
ON public.bulk_sms_queue
FOR UPDATE
TO anon
USING (lower(status) = ANY (ARRAY['pending','sending']))
WITH CHECK (lower(status) = ANY (ARRAY[
  'sending','sent','failed','queued','processing','success','delivered','completed','complete','done','ok','error','failure','failed_error','undelivered'
]));