-- 1. Transactions summary RPC
CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(
  p_provider_id uuid DEFAULT NULL,
  p_period text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  today_start timestamptz := date_trunc('day', now());
  month_start timestamptz := date_trunc('month', now());
  period_start timestamptz;
BEGIN
  period_start := CASE p_period
    WHEN 'today' THEN today_start
    WHEN 'week' THEN date_trunc('week', now())
    WHEN 'month' THEN month_start
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  WITH base AS (
    SELECT
      o.id, o.amount, o.status, o.created_at,
      COALESCE(p.cost_price, 0) AS cost_price,
      COALESCE(p.selling_price, p.price, o.amount) AS selling_price,
      COALESCE(pr.evoucher_rate, 0) AS evoucher_rate
    FROM public.orders o
    LEFT JOIN public.data_packages_config p ON p.id = o.package_id
    LEFT JOIN public.providers_config pr ON pr.id = o.provider_id
    WHERE (p_provider_id IS NULL OR o.provider_id = p_provider_id)
      AND o.created_at >= period_start
  )
  SELECT jsonb_build_object(
    'transactions_today', (SELECT COUNT(*) FROM base WHERE created_at >= today_start),
    'sales_today', COALESCE((SELECT SUM(amount) FROM base WHERE created_at >= today_start AND status = 'completed'), 0),
    'sales_this_month', COALESCE((SELECT SUM(amount) FROM base WHERE created_at >= month_start AND status = 'completed'), 0),
    'cost_today', COALESCE((SELECT SUM(cost_price) FROM base WHERE created_at >= today_start AND status = 'completed'), 0),
    'cost_this_month', COALESCE((SELECT SUM(cost_price) FROM base WHERE created_at >= month_start AND status = 'completed'), 0),
    'total_sales', COALESCE((SELECT SUM(amount) FROM base WHERE status = 'completed'), 0),
    'total_cost', COALESCE((SELECT SUM(cost_price) FROM base WHERE status = 'completed'), 0),
    'total_profit', COALESCE((SELECT SUM((selling_price * (1 + evoucher_rate)) - cost_price) FROM base WHERE status = 'completed'), 0),
    'total_count', (SELECT COUNT(*) FROM base)
  ) INTO result;
  RETURN result;
END;
$$;

-- 2. Transactions paginated RPC
CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_provider_id uuid DEFAULT NULL,
  p_period text DEFAULT 'all',
  p_page_size int DEFAULT 50,
  p_page int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  period_start timestamptz;
  v_offset int := GREATEST(0, (p_page - 1) * p_page_size);
BEGIN
  period_start := CASE p_period
    WHEN 'today' THEN date_trunc('day', now())
    WHEN 'week' THEN date_trunc('week', now())
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  WITH filtered AS (
    SELECT
      o.id, o.order_number, o.sender_phone, o.receiver_phone, o.amount,
      o.status, o.payment_status, o.created_at, o.delivered_at, o.is_offline,
      o.delivery_notes, o.package_id, o.provider_id,
      COALESCE(p.cost_price, 0) AS cost_price,
      COALESCE(p.selling_price, p.price, o.amount) AS selling_price,
      COALESCE(pr.evoucher_rate, 0) AS evoucher_rate,
      p.package_name,
      p.data_amount,
      pr.display_name AS provider_name,
      pr.logo_url AS provider_logo
    FROM public.orders o
    LEFT JOIN public.data_packages_config p ON p.id = o.package_id
    LEFT JOIN public.providers_config pr ON pr.id = o.provider_id
    WHERE (p_provider_id IS NULL OR o.provider_id = p_provider_id)
      AND (p_status IS NULL OR p_status = 'all' OR o.status::text = p_status)
      AND o.created_at >= period_start
      AND (
        p_search IS NULL OR p_search = ''
        OR o.order_number ILIKE '%' || p_search || '%'
        OR o.sender_phone ILIKE '%' || p_search || '%'
        OR o.receiver_phone ILIKE '%' || p_search || '%'
      )
  ),
  totals AS (
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS total_sales,
      COALESCE(SUM((selling_price * (1 + evoucher_rate)) - cost_price) FILTER (WHERE status = 'completed'), 0) AS total_profit
    FROM filtered
  ),
  page_rows AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(page_rows.*)) FROM page_rows), '[]'::jsonb),
    'total_count', (SELECT total_count FROM totals),
    'total_sales', (SELECT total_sales FROM totals),
    'total_profit', (SELECT total_profit FROM totals)
  ) INTO result;
  RETURN result;
END;
$$;

-- 3. Allow admins to DELETE from sms_logs and payment_sms_log
CREATE POLICY "Admins delete sms_logs"
ON public.sms_logs FOR DELETE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins delete payment_sms_log"
ON public.payment_sms_log FOR DELETE
USING (is_admin(auth.uid()));