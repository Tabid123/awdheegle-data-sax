DROP POLICY IF EXISTS "Devices can update bulk sms queue status" ON public.bulk_sms_queue;

CREATE POLICY "Devices can update bulk sms queue status"
ON public.bulk_sms_queue
FOR UPDATE
TO anon
USING (true)
WITH CHECK (status IN ('pending','sending','sent','failed','queued','processing'));

GRANT UPDATE (status, error, error_message, sent_at, device_id, sim_slot) ON public.bulk_sms_queue TO anon;