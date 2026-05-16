-- Correct the one-time claim flow: reading a pending SMS should claim it as sending,
-- not mark it sent before the Android device actually sends the SMS.
CREATE OR REPLACE FUNCTION public.mark_bulk_sms_claimed_on_read(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.bulk_sms_queue q
  SET status = 'sending',
      sent_at = NULL,
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
USING (
  lower(status) = ANY (ARRAY['pending','sending','sent','failed'])
)
WITH CHECK (
  lower(status) = ANY (ARRAY[
    'sending','sent','failed','queued','processing',
    'success','delivered','completed','complete','done','ok',
    'error','failure','failed_error','undelivered'
  ])
);

-- Stop any SMS that was claimed but never completed long ago; it should not be retried endlessly.
UPDATE public.bulk_sms_queue
SET status = 'failed',
    error = 'Stopped stuck Bulk SMS claim to prevent duplicate sending',
    error_message = 'Stopped stuck Bulk SMS claim to prevent duplicate sending'
WHERE status = 'sending'
  AND sent_at IS NULL
  AND created_at < now() - interval '15 minutes';

-- Recalculate campaigns after the correction.
WITH stats AS (
  SELECT
    c.id,
    count(q.id)::int AS total,
    count(q.id) FILTER (WHERE q.status = 'sent')::int AS sent,
    count(q.id) FILTER (WHERE q.status = 'failed')::int AS failed,
    count(q.id) FILTER (WHERE q.status IN ('pending','sending'))::int AS active
  FROM public.bulk_sms_campaigns c
  LEFT JOIN public.bulk_sms_queue q ON q.campaign_id = c.id
  GROUP BY c.id
)
UPDATE public.bulk_sms_campaigns c
SET sent_count = s.sent,
    failed_count = s.failed,
    status = CASE
      WHEN s.total = 0 THEN CASE WHEN c.status = 'sending' THEN 'completed' ELSE c.status END
      WHEN s.active > 0 THEN 'sending'
      WHEN (s.sent + s.failed) >= s.total THEN
        CASE
          WHEN s.failed = s.total THEN 'failed'
          WHEN s.failed > 0 THEN 'completed_with_errors'
          ELSE 'completed'
        END
      ELSE c.status
    END,
    completed_at = CASE
      WHEN s.total > 0 AND s.active = 0 AND (s.sent + s.failed) >= s.total THEN COALESCE(c.completed_at, now())
      WHEN s.total = 0 AND c.status = 'sending' THEN COALESCE(c.completed_at, now())
      ELSE NULL
    END
FROM stats s
WHERE c.id = s.id;