
-- Replace trigger so it only cancels siblings with the SAME ussd_code (duplicate retries),
-- never legitimate linked/bundled deliveries with different USSD codes
CREATE OR REPLACE FUNCTION public.cancel_sibling_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.delivery_queue
    SET status = 'cancelled',
        error_message = COALESCE(error_message, 'Superseded by completed retry'),
        completed_at = COALESCE(completed_at, now())
    WHERE order_id = NEW.order_id
      AND id <> NEW.id
      AND status IN ('processing', 'pending', 'queued', 'scheduled')
      AND ussd_code IS NOT DISTINCT FROM NEW.ussd_code;  -- only same USSD = duplicate retry
  END IF;
  RETURN NEW;
END;
$$;

-- Restore linked deliveries wrongly cancelled in the last 2 days
-- (cancelled by the previous version of the trigger but with a DIFFERENT ussd_code than the completed sibling)
UPDATE public.delivery_queue dq
SET status = 'pending',
    error_message = NULL,
    completed_at = NULL,
    claimed_by = NULL,
    android_device_id = NULL,
    claimed_at = NULL,
    attempts = 0
WHERE dq.status = 'cancelled'
  AND dq.error_message = 'Superseded by completed retry'
  AND dq.created_at > now() - interval '2 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.delivery_queue sib
    WHERE sib.order_id = dq.order_id
      AND sib.id <> dq.id
      AND sib.status = 'completed'
      AND sib.ussd_code IS NOT DISTINCT FROM dq.ussd_code
  );
