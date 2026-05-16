-- Fix direct Bulk SMS polling: SELECT policies cannot update rows in PostgREST read-only transactions.
-- Devices can read unclaimed pending rows, then claim by updating status to sending.
DROP POLICY IF EXISTS "Devices can read pending bulk sms queue" ON public.bulk_sms_queue;
CREATE POLICY "Devices can read pending bulk sms queue"
ON public.bulk_sms_queue
FOR SELECT
TO anon
USING (
  status = 'pending'
  AND claimed_at IS NULL
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
USING (lower(status) IN ('pending', 'sending'))
WITH CHECK (
  lower(status) IN (
    'sending', 'sent', 'failed', 'queued', 'processing',
    'success', 'delivered', 'completed', 'complete', 'done', 'ok',
    'error', 'failure', 'failed_error', 'undelivered'
  )
);

-- Make direct client claims populate claimed_at when status moves away from pending.
CREATE OR REPLACE FUNCTION public.set_bulk_sms_claimed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'pending'
     AND NEW.status IN ('sending', 'queued', 'processing')
     AND NEW.claimed_at IS NULL THEN
    NEW.claimed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_bulk_sms_claimed_at_trigger ON public.bulk_sms_queue;
CREATE TRIGGER set_bulk_sms_claimed_at_trigger
BEFORE UPDATE ON public.bulk_sms_queue
FOR EACH ROW
EXECUTE FUNCTION public.set_bulk_sms_claimed_at();