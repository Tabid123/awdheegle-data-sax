-- Keep Bulk SMS campaign recipient counters compatible with both old and new clients.
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

-- Normalize device-reported queue statuses before saving.
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

  IF NEW.status IN ('sent', 'failed') THEN
    NEW.error := CASE WHEN NEW.status = 'sent' THEN NULL ELSE NEW.error END;
    NEW.error_message := CASE WHEN NEW.status = 'sent' THEN NULL ELSE COALESCE(NEW.error_message, NEW.error) END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_bulk_sms_queue_status ON public.bulk_sms_queue;
CREATE TRIGGER trg_normalize_bulk_sms_queue_status
BEFORE INSERT OR UPDATE ON public.bulk_sms_queue
FOR EACH ROW EXECUTE FUNCTION public.normalize_bulk_sms_queue_status();

-- Recalculate campaign progress any time queue rows change.
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

-- One-time claim guard: first device read returns the row and immediately removes it from future polls.
CREATE OR REPLACE FUNCTION public.mark_bulk_sms_claimed_on_read(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.bulk_sms_queue q
  SET status = 'sent',
      sent_at = COALESCE(q.sent_at, now()),
      error = NULL,
      error_message = NULL
  WHERE q.id = p_queue_id
    AND q.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.bulk_sms_campaigns c
      WHERE c.id = q.campaign_id
        AND c.status IN ('pending', 'sending')
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_bulk_sms_claimed_on_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_bulk_sms_claimed_on_read(uuid) TO anon;

DROP POLICY IF EXISTS "Devices can read pending bulk sms queue" ON public.bulk_sms_queue;
CREATE POLICY "Devices can read pending bulk sms queue"
ON public.bulk_sms_queue
FOR SELECT
TO anon
USING (
  status = 'pending'
  AND public.mark_bulk_sms_claimed_on_read(id)
);

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

GRANT SELECT ON public.bulk_sms_queue TO anon;
GRANT UPDATE (status, error, error_message, sent_at, device_id, sim_slot) ON public.bulk_sms_queue TO anon;
GRANT SELECT ON public.bulk_sms_campaigns TO anon;

-- Backfill campaign totals from actual queue rows.
WITH queue_counts AS (
  SELECT campaign_id, count(*)::int AS queue_total
  FROM public.bulk_sms_queue
  GROUP BY campaign_id
), normalized AS (
  SELECT
    c.id,
    GREATEST(COALESCE(c.total_recipients, 0), COALESCE(c.recipient_count, 0), COALESCE(q.queue_total, 0)) AS total
  FROM public.bulk_sms_campaigns c
  LEFT JOIN queue_counts q ON q.campaign_id = c.id
)
UPDATE public.bulk_sms_campaigns c
SET total_recipients = n.total,
    recipient_count = n.total
FROM normalized n
WHERE c.id = n.id;

-- Stop older pending campaigns; leave only the newest pending campaign available to be sent.
WITH latest_pending_campaign AS (
  SELECT campaign_id
  FROM public.bulk_sms_queue
  WHERE status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE public.bulk_sms_queue q
SET status = 'failed',
    error = 'Stopped stale pending Bulk SMS to prevent duplicate sending',
    error_message = 'Stopped stale pending Bulk SMS to prevent duplicate sending'
WHERE q.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM latest_pending_campaign l WHERE l.campaign_id = q.campaign_id
  );

-- Recompute every campaign now that triggers are restored and stale rows are stopped.
WITH stats AS (
  SELECT
    c.id,
    count(q.id)::int AS total,
    count(q.id) FILTER (WHERE q.status = 'sent')::int AS sent,
    count(q.id) FILTER (WHERE q.status = 'failed')::int AS failed
  FROM public.bulk_sms_campaigns c
  LEFT JOIN public.bulk_sms_queue q ON q.campaign_id = c.id
  GROUP BY c.id
)
UPDATE public.bulk_sms_campaigns c
SET sent_count = s.sent,
    failed_count = s.failed,
    total_recipients = GREATEST(COALESCE(c.total_recipients, 0), COALESCE(c.recipient_count, 0), s.total),
    recipient_count = GREATEST(COALESCE(c.total_recipients, 0), COALESCE(c.recipient_count, 0), s.total),
    status = CASE
      WHEN s.total = 0 THEN CASE WHEN c.status = 'sending' THEN 'completed' ELSE c.status END
      WHEN (s.sent + s.failed) >= s.total THEN
        CASE
          WHEN s.failed = s.total THEN 'failed'
          WHEN s.failed > 0 THEN 'completed_with_errors'
          ELSE 'completed'
        END
      ELSE 'sending'
    END,
    completed_at = CASE
      WHEN s.total = 0 AND c.status = 'sending' THEN COALESCE(c.completed_at, now())
      WHEN s.total > 0 AND (s.sent + s.failed) >= s.total THEN COALESCE(c.completed_at, now())
      ELSE NULL
    END
FROM stats s
WHERE c.id = s.id;