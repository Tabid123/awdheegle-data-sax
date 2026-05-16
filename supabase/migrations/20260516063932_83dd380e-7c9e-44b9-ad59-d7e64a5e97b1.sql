UPDATE public.bulk_sms_queue
SET status = 'failed',
    error = 'Stopped duplicate retry: old pending SMS was manually halted',
    error_message = 'Stopped duplicate retry: old pending SMS was manually halted',
    sent_at = COALESCE(sent_at, now())
WHERE status IN ('pending', 'sending', 'queued', 'processing')
  AND created_at < now() - interval '1 minute';