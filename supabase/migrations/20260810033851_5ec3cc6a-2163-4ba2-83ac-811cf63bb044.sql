
CREATE OR REPLACE FUNCTION public.get_data_retention_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(7, LEAST(365, COALESCE(
    (SELECT NULLIF(regexp_replace(setting_value #>> '{}', '\D', '', 'g'), '')::int
     FROM public.app_settings WHERE setting_key = 'data_retention_days'),
    15)))
$$;

CREATE OR REPLACE FUNCTION public.set_data_retention_days(p_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_days NOT IN (15, 30, 60, 90) THEN
    RAISE EXCEPTION 'invalid retention: %', p_days;
  END IF;

  INSERT INTO public.app_settings (setting_key, setting_value, description)
  VALUES ('data_retention_days', to_jsonb(p_days), 'Maalmaha xogta log-yada iyo dalabyada la keydinayo')
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = to_jsonb(p_days), updated_at = now();

  RETURN p_days;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int := public.get_data_retention_days();
  v_keep interval;
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
  v_keep := (v_days || ' days')::interval;

  v_stats := public.rollup_order_stats(v_days);

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

  -- Log-type data only. Notifications are NEVER deleted.
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
    'retention_days', v_days,
    'ran_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_run_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN public.cleanup_old_data();
END;
$$;

REVOKE ALL ON FUNCTION public.get_data_retention_days() FROM anon;
REVOKE ALL ON FUNCTION public.set_data_retention_days(integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_run_cleanup() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_data() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_data_retention_days() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_data_retention_days(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_cleanup() TO authenticated;
