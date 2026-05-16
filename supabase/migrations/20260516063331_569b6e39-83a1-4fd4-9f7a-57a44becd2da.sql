-- Restore device access policies needed by the Android bulk SMS sender.
-- A previous admin-only policy removed anon device RLS access, so devices could not fetch pending queue rows.

DROP POLICY IF EXISTS "Devices can read pending bulk sms queue" ON public.bulk_sms_queue;
CREATE POLICY "Devices can read pending bulk sms queue"
ON public.bulk_sms_queue
FOR SELECT
TO anon
USING (status = 'pending');

DROP POLICY IF EXISTS "Devices can update bulk sms queue status" ON public.bulk_sms_queue;
CREATE POLICY "Devices can update bulk sms queue status"
ON public.bulk_sms_queue
FOR UPDATE
TO anon
USING (status = 'pending')
WITH CHECK (status IN ('sent', 'failed', 'pending'));

DROP POLICY IF EXISTS "Devices can read bulk sms campaigns" ON public.bulk_sms_campaigns;
CREATE POLICY "Devices can read bulk sms campaigns"
ON public.bulk_sms_campaigns
FOR SELECT
TO anon
USING (true);

GRANT SELECT ON public.bulk_sms_queue TO anon;
GRANT UPDATE (status, error, error_message, sent_at) ON public.bulk_sms_queue TO anon;
GRANT SELECT ON public.bulk_sms_campaigns TO anon;