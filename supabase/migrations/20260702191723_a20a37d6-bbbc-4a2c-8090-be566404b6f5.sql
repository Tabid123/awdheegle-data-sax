-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Speed up cleanup deletes
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_created_at ON public.payment_receipts (created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_queue_status_created ON public.delivery_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_online_payments_created_at ON public.pending_online_payments (created_at);
CREATE INDEX IF NOT EXISTS idx_bulk_sms_queue_status_created ON public.bulk_sms_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at);

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sms int := 0;
  v_receipts int := 0;
  v_dq int := 0;
  v_pending int := 0;
  v_bulk int := 0;
  v_audit int := 0;
  v_notif int := 0;
BEGIN
  WITH d AS (DELETE FROM public.sms_logs WHERE created_at < now() - interval '60 days' RETURNING 1)
  SELECT count(*) INTO v_sms FROM d;

  WITH d AS (
    DELETE FROM public.payment_receipts
    WHERE created_at < now() - interval '90 days'
      AND (matched_order_id IS NOT NULL OR order_id IS NOT NULL)
    RETURNING 1
  ) SELECT count(*) INTO v_receipts FROM d;

  WITH d AS (
    DELETE FROM public.delivery_queue
    WHERE created_at < now() - interval '30 days'
      AND status IN ('completed', 'cancelled', 'failed')
    RETURNING 1
  ) SELECT count(*) INTO v_dq FROM d;

  WITH d AS (
    DELETE FROM public.pending_online_payments
    WHERE created_at < now() - interval '7 days'
    RETURNING 1
  ) SELECT count(*) INTO v_pending FROM d;

  WITH d AS (
    DELETE FROM public.bulk_sms_queue
    WHERE created_at < now() - interval '30 days'
      AND status IN ('sent', 'failed')
    RETURNING 1
  ) SELECT count(*) INTO v_bulk FROM d;

  WITH d AS (DELETE FROM public.audit_logs WHERE created_at < now() - interval '60 days' RETURNING 1)
  SELECT count(*) INTO v_audit FROM d;

  WITH d AS (
    DELETE FROM public.notifications
    WHERE created_at < now() - interval '30 days'
      AND COALESCE(is_read, false) = true
    RETURNING 1
  ) SELECT count(*) INTO v_notif FROM d;

  RETURN jsonb_build_object(
    'sms_logs', v_sms,
    'payment_receipts', v_receipts,
    'delivery_queue', v_dq,
    'pending_online_payments', v_pending,
    'bulk_sms_queue', v_bulk,
    'audit_logs', v_audit,
    'notifications', v_notif,
    'ran_at', now()
  );
END;
$$;

-- Unschedule any prior version, then schedule daily at 02:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-data-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-data-daily',
  '0 2 * * *',
  $$ SELECT public.cleanup_old_data(); $$
);