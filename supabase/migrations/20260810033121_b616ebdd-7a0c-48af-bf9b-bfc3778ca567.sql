
CREATE TABLE IF NOT EXISTS public.order_stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date date NOT NULL,
  provider_name text NOT NULL DEFAULT 'unknown',
  total_orders integer NOT NULL DEFAULT 0,
  completed_orders integer NOT NULL DEFAULT 0,
  failed_orders integer NOT NULL DEFAULT 0,
  cancelled_orders integer NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  total_profit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stat_date, provider_name)
);

GRANT SELECT ON public.order_stats_daily TO authenticated;
GRANT ALL ON public.order_stats_daily TO service_role;

ALTER TABLE public.order_stats_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view order stats"
ON public.order_stats_daily FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_order_stats_daily_updated_at
BEFORE UPDATE ON public.order_stats_daily
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Aggregation helper: rolls up orders (optionally only older than N days) into order_stats_daily
CREATE OR REPLACE FUNCTION public.rollup_order_stats(p_older_than_days integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int := 0;
BEGIN
  WITH src AS (
    SELECT
      (o.created_at AT TIME ZONE 'UTC')::date AS stat_date,
      COALESCE(p.provider_name, 'unknown') AS provider_name,
      count(*)::int AS total_orders,
      count(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders,
      count(*) FILTER (WHERE o.status = 'failed')::int AS failed_orders,
      count(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_orders,
      COALESCE(sum(COALESCE(o.selling_price, o.amount)) FILTER (WHERE o.status = 'completed'), 0) AS total_revenue,
      COALESCE(sum(COALESCE(o.cost_price, 0)) FILTER (WHERE o.status = 'completed'), 0) AS total_cost
    FROM public.orders o
    LEFT JOIN public.providers_config p ON p.id = o.provider_id
    WHERE p_older_than_days IS NULL
       OR o.created_at < now() - (p_older_than_days || ' days')::interval
    GROUP BY 1, 2
  ), ins AS (
    INSERT INTO public.order_stats_daily AS t (
      stat_date, provider_name, total_orders, completed_orders, failed_orders,
      cancelled_orders, total_revenue, total_cost, total_profit
    )
    SELECT stat_date, provider_name, total_orders, completed_orders, failed_orders,
           cancelled_orders, total_revenue, total_cost, total_revenue - total_cost
    FROM src
    ON CONFLICT (stat_date, provider_name) DO UPDATE SET
      total_orders = GREATEST(t.total_orders, EXCLUDED.total_orders),
      completed_orders = GREATEST(t.completed_orders, EXCLUDED.completed_orders),
      failed_orders = GREATEST(t.failed_orders, EXCLUDED.failed_orders),
      cancelled_orders = GREATEST(t.cancelled_orders, EXCLUDED.cancelled_orders),
      total_revenue = GREATEST(t.total_revenue, EXCLUDED.total_revenue),
      total_cost = GREATEST(t.total_cost, EXCLUDED.total_cost),
      total_profit = GREATEST(t.total_profit, EXCLUDED.total_profit),
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO v_rows FROM ins;

  RETURN v_rows;
END;
$$;

-- Preserve every existing day's stats before any deletion ever happens
SELECT public.rollup_order_stats(NULL);

-- 15-day retention everywhere, orders rolled up first
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
  v_notif int := 0;
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

  -- 3) Everything else: 15 days only
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

  WITH d AS (DELETE FROM public.notifications WHERE created_at < now() - v_keep RETURNING 1)
  SELECT count(*) INTO v_notif FROM d;

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
    'notifications', v_notif,
    'bank_transactions', v_bank,
    'retention_days', 15,
    'ran_at', now()
  );
END;
$$;
