
-- Cleanup: re-classify orders as delivered when their delivery notes
-- contain clear Hormuud success markers but the status is still failed/timeout.
-- These orders DID succeed (money was sent) but were mis-flagged due to the
-- Android dialer timing out before the silent USSD callback arrived.

UPDATE public.orders
SET delivery_status = 'delivered',
    status = 'completed',
    delivered_at = COALESCE(delivered_at, now()),
    updated_at = now()
WHERE delivery_status IN ('failed', 'timeout', 'pending')
  AND status <> 'completed'
  AND delivery_notes IS NOT NULL
  AND (
    delivery_notes ILIKE '%ugu shubtay%'
    OR delivery_notes ILIKE '%u shubtay%'
    OR delivery_notes ILIKE '%haraagaagu waa%'
    OR delivery_notes ILIKE '%transaction id%'
    OR delivery_notes ILIKE '%lacagta waa la diray%'
    OR delivery_notes ILIKE '%ku guulaysatay%'
  );

-- Same cleanup for delivery_queue rows that have a successful provider_response
UPDATE public.delivery_queue
SET status = 'completed',
    completed_at = COALESCE(completed_at, now())
WHERE status IN ('failed', 'timeout', 'pending')
  AND provider_response IS NOT NULL
  AND (
    provider_response ILIKE '%ugu shubtay%'
    OR provider_response ILIKE '%u shubtay%'
    OR provider_response ILIKE '%haraagaagu waa%'
    OR provider_response ILIKE '%transaction id%'
    OR provider_response ILIKE '%lacagta waa la diray%'
    OR provider_response ILIKE '%ku guulaysatay%'
  );
