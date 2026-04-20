-- 1. Clear all transactional data
TRUNCATE TABLE 
  public.delivery_queue,
  public.unmatched_payments,
  public.payment_receipts,
  public.payment_sms_log,
  public.sms_logs,
  public.pending_online_payments,
  public.orders
RESTART IDENTITY CASCADE;

-- 2. Update analytics summary to use Africa/Mogadishu timezone
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  tz constant text := 'Africa/Mogadishu';
  today_start timestamptz := date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz;
  week_start timestamptz := date_trunc('week', now() AT TIME ZONE tz) AT TIME ZONE tz;
  month_start timestamptz := date_trunc('month', now() AT TIME ZONE tz) AT TIME ZONE tz;
  year_start timestamptz := date_trunc('year', now() AT TIME ZONE tz) AT TIME ZONE tz;
BEGIN
  WITH period_stats AS (
    SELECT
      o.id,
      o.amount,
      o.status,
      o.created_at,
      COALESCE(p.cost_price, 0) AS cost_price,
      COALESCE(p.selling_price, p.price, o.amount) AS selling_price,
      COALESCE(pr.evoucher_rate, 0) AS evoucher_rate
    FROM public.orders o
    LEFT JOIN public.data_packages_config p ON p.id = o.package_id
    LEFT JOIN public.providers_config pr ON pr.id = o.provider_id
  ),
  agg AS (
    SELECT
      jsonb_build_object(
        'orders', count(*),
        'delivered', count(*) FILTER (WHERE status = 'completed'),
        'failed', count(*) FILTER (WHERE status = 'failed'),
        'pending', count(*) FILTER (WHERE status = 'pending'),
        'revenue', COALESCE(sum(amount) FILTER (WHERE status = 'completed'), 0),
        'cost', COALESCE(sum(cost_price) FILTER (WHERE status = 'completed'), 0),
        'profit', COALESCE(sum((selling_price * (1 + evoucher_rate)) - cost_price) FILTER (WHERE status = 'completed'), 0)
      ) AS today_data
    FROM period_stats WHERE created_at >= today_start
  ),
  agg_week AS (
    SELECT jsonb_build_object(
      'orders', count(*),
      'delivered', count(*) FILTER (WHERE status = 'completed'),
      'failed', count(*) FILTER (WHERE status = 'failed'),
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'revenue', COALESCE(sum(amount) FILTER (WHERE status = 'completed'), 0),
      'cost', COALESCE(sum(cost_price) FILTER (WHERE status = 'completed'), 0),
      'profit', COALESCE(sum((selling_price * (1 + evoucher_rate)) - cost_price) FILTER (WHERE status = 'completed'), 0)
    ) AS week_data
    FROM period_stats WHERE created_at >= week_start
  ),
  agg_month AS (
    SELECT jsonb_build_object(
      'orders', count(*),
      'delivered', count(*) FILTER (WHERE status = 'completed'),
      'failed', count(*) FILTER (WHERE status = 'failed'),
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'revenue', COALESCE(sum(amount) FILTER (WHERE status = 'completed'), 0),
      'cost', COALESCE(sum(cost_price) FILTER (WHERE status = 'completed'), 0),
      'profit', COALESCE(sum((selling_price * (1 + evoucher_rate)) - cost_price) FILTER (WHERE status = 'completed'), 0)
    ) AS month_data
    FROM period_stats WHERE created_at >= month_start
  ),
  agg_year AS (
    SELECT jsonb_build_object(
      'orders', count(*),
      'delivered', count(*) FILTER (WHERE status = 'completed'),
      'failed', count(*) FILTER (WHERE status = 'failed'),
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'revenue', COALESCE(sum(amount) FILTER (WHERE status = 'completed'), 0),
      'cost', COALESCE(sum(cost_price) FILTER (WHERE status = 'completed'), 0),
      'profit', COALESCE(sum((selling_price * (1 + evoucher_rate)) - cost_price) FILTER (WHERE status = 'completed'), 0)
    ) AS year_data
    FROM period_stats WHERE created_at >= year_start
  )
  SELECT jsonb_build_object(
    'today', (SELECT today_data FROM agg),
    'week', (SELECT week_data FROM agg_week),
    'month', (SELECT month_data FROM agg_month),
    'year', (SELECT year_data FROM agg_year),
    'total_orders', (SELECT count(*) FROM public.orders),
    'total_revenue', COALESCE((SELECT sum(amount) FROM public.orders WHERE status = 'completed'), 0),
    'pending_orders', (SELECT count(*) FROM public.orders WHERE status = 'pending'),
    'completed_orders', (SELECT count(*) FROM public.orders WHERE status = 'completed'),
    'delivered_orders', (SELECT count(*) FROM public.orders WHERE status = 'completed'),
    'failed_orders', (SELECT count(*) FROM public.orders WHERE status = 'failed'),
    'active_devices', (SELECT count(*) FROM public.android_devices WHERE status = 'online'),
    'devices_online', (SELECT count(*) FROM public.android_devices WHERE status = 'online'),
    'total_devices', (SELECT count(*) FROM public.android_devices)
  ) INTO result;
  RETURN result;
END;
$function$;

-- 3. Update transactions summary to use Mogadishu timezone
CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(p_provider_id uuid DEFAULT NULL::uuid, p_period text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  tz constant text := 'Africa/Mogadishu';
  today_start timestamptz := date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz;
  month_start timestamptz := date_trunc('month', now() AT TIME ZONE tz) AT TIME ZONE tz;
  period_start timestamptz;
BEGIN
  period_start := CASE p_period
    WHEN 'today' THEN today_start
    WHEN 'week' THEN date_trunc('week', now() AT TIME ZONE tz) AT TIME ZONE tz
    WHEN 'month' THEN month_start
    WHEN 'year' THEN date_trunc('year', now() AT TIME ZONE tz) AT TIME ZONE tz
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
$function$;

-- 4. Update paginated transactions to use Mogadishu timezone
CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_provider_id uuid DEFAULT NULL::uuid, p_period text DEFAULT 'all'::text, p_page_size integer DEFAULT 50, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  tz constant text := 'Africa/Mogadishu';
  period_start timestamptz;
  v_offset int := GREATEST(0, (p_page - 1) * p_page_size);
BEGIN
  period_start := CASE p_period
    WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz
    WHEN 'week' THEN date_trunc('week', now() AT TIME ZONE tz) AT TIME ZONE tz
    WHEN 'month' THEN date_trunc('month', now() AT TIME ZONE tz) AT TIME ZONE tz
    WHEN 'year' THEN date_trunc('year', now() AT TIME ZONE tz) AT TIME ZONE tz
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
$function$;