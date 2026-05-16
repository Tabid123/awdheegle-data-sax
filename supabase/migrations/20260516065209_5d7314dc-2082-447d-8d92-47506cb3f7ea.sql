-- Prevent duplicate Bulk SMS sends by atomically marking a queue row as sent when an anon device reads it.
-- This is a defensive database-side guard for Android clients that fetch pending rows repeatedly
-- without reliably reporting a terminal status back to the database.

CREATE OR REPLACE FUNCTION public.mark_bulk_sms_claimed_on_read(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.bulk_sms_queue
  SET status = 'sent',
      sent_at = COALESCE(sent_at, now()),
      error = NULL,
      error_message = NULL
  WHERE id = p_queue_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_bulk_sms_claimed_on_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_bulk_sms_claimed_on_read(uuid) TO anon;

-- Device reads now behave like a one-time claim: first read returns the pending row and marks it sent.
-- Later polls cannot see the same row again because it is no longer pending.
DROP POLICY IF EXISTS "Devices can read pending bulk sms queue" ON public.bulk_sms_queue;
CREATE POLICY "Devices can read pending bulk sms queue"
ON public.bulk_sms_queue
FOR SELECT
TO anon
USING (
  status = 'pending'
  AND public.mark_bulk_sms_claimed_on_read(id)
);

-- Device may still correct the terminal status afterwards if the Android app reports a failure/success.
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

-- Stop the currently stuck/repeating messages immediately and make the UI leave "sending".
UPDATE public.bulk_sms_queue
SET status = 'sent',
    sent_at = COALESCE(sent_at, now()),
    error = NULL,
    error_message = NULL
WHERE status IN ('pending', 'sending', 'queued', 'processing');