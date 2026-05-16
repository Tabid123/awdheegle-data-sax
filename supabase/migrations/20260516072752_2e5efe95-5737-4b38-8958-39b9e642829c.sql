-- Force Bulk SMS devices to use the atomic RPC instead of direct table polling.
-- Direct SELECT polling can resend the same pending row if the Android app does not claim it first.
DROP POLICY IF EXISTS "Devices can read pending bulk sms queue" ON public.bulk_sms_queue;

DROP POLICY IF EXISTS "Devices can update bulk sms queue status" ON public.bulk_sms_queue;
CREATE POLICY "Devices can update claimed bulk sms status"
ON public.bulk_sms_queue
FOR UPDATE
TO anon
USING (
  status = 'sending'
  AND claimed_at IS NOT NULL
)
WITH CHECK (
  lower(status) IN (
    'sending', 'sent', 'failed', 'queued', 'processing',
    'success', 'delivered', 'completed', 'complete', 'done', 'ok',
    'error', 'failure', 'failed_error', 'undelivered'
  )
);

-- Keep only the safe RPC available to devices.
REVOKE SELECT ON public.bulk_sms_queue FROM anon;
REVOKE UPDATE ON public.bulk_sms_queue FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_next_bulk_sms(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_next_bulk_sms(text, integer) TO authenticated;