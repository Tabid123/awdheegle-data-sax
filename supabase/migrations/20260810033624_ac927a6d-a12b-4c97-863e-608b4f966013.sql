
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep constant interval := interval '15 days';
  v_stats int := 0;
  v_orders int := 0;
  v_sms int := 0;
  v_receipts int := 0;
  v_dq int := 0;
  v_pending int := 0;
  v_bulk int := 0;
  v_audit int := 0;
  v_sms_pay int := 0;
  v_bank int := 0;
BEGIN
  -- 1) Save order statistics permanently before deleting old orders
  v_stats := public.rollup_order_stats(15);

  -- 2) Detach references so old orders can be removed
  UPDATE public.payment_receipts SET order_id = NULL, matched_order_id = NULL
  WHERE (order_id IN (SELECT id FROM public.orders WHERE created_at < now() - v_keep)
      OR matched_order_id IN (SELECT id FROM public.orders WHERE created_at < now() - v_keep));

  UPDATE public.payment_sms_log SET matched_order_id = NULL
  WHERE matched_order_id IN (SELECT id FROM public.orders WHERE created_at < now() - v_keep);

  UPDATE public.bank_transactions SET matched_order_id = NULL
  WHERE matched_order_id IN (SELECT id FROM public.orders WHERE created_at < now() - v_keep);

  UPDATE public.pending_online_payments SET matched_order_id = NULL
  WHERE matched_order_id IN (SELECT id FROM public.orders WHERE created_at < now() - v_keep);

  DELETE FROM public.delivery_queue
  WHERE order_id IN (SELECT id FROM public.orders WHERE created_at < now() - v_keep);

  WITH d AS (DELETE FROM public.orders WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_orders FROM d;

  -- 3) Log-type data only: 15 days. Notifications are NEVER deleted.
  WITH d AS (DELETE FROM public.sms_logs WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_sms FROM d;

  WITH d AS (DELETE FROM public.payment_sms_log WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_sms_pay FROM d;

  WITH d AS (DELETE FROM public.payment_receipts WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_receipts FROM d;

  WITH d AS (DELETE FROM public.delivery_queue WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_dq FROM d;

  WITH d AS (DELETE FROM public.pending_online_payments WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_pending FROM d;

  WITH d AS (DELETE FROM public.bulk_sms_queue WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_bulk FROM d;

  WITH d AS (DELETE FROM public.audit_logs WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_audit FROM d;

  WITH d AS (DELETE FROM public.bank_transactions WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_bank FROM d;

  RETURN jsonb_build_object(
    'stats_rows_saved', v_stats,
    'orders', v_orders,
    'sms_logs', v_sms,
    'payment_sms_log', v_sms_pay,
    'payment_receipts', v_receipts,
    'delivery_queue', v_dq,
    'pending_online_payments', v_pending,
    'bulk_sms_queue', v_bulk,
    'audit_logs', v_audit,
    'notifications', 'skipped',
    'bank_transactions', v_bank,
    'retention_days', 15,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_data() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_data() TO service_role;
