-- 1. Add secret_price to data_packages_config
ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS secret_price numeric NULL;

-- 2. Add paid_via_secret_price flag to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_via_secret_price boolean NOT NULL DEFAULT false;

-- 3. Update get_admin_transactions_paginated to include paid_via_secret_price
CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_search text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_provider_id uuid DEFAULT NULL::uuid,
  p_period text DEFAULT 'all'::text,
  p_page_size integer DEFAULT 50,
  p_page integer DEFAULT 1
)
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
      o.paid_via_secret_price,
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