-- 1. AUTO TOPUP NUMBERS
CREATE TABLE IF NOT EXISTS public.auto_topup_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_topup_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage auto_topup_numbers"
  ON public.auto_topup_numbers FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Public read auto_topup_numbers"
  ON public.auto_topup_numbers FOR SELECT USING (true);

CREATE TRIGGER trg_auto_topup_numbers_updated_at
BEFORE UPDATE ON public.auto_topup_numbers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. AUTO TOPUP PACKAGES
CREATE TABLE IF NOT EXISTS public.auto_topup_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topup_number_id uuid NOT NULL REFERENCES public.auto_topup_numbers(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  selling_price numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  data_amount text,
  ussd_code text,
  sim_password text,
  provider_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_topup_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage auto_topup_packages"
  ON public.auto_topup_packages FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Public read auto_topup_packages"
  ON public.auto_topup_packages FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_auto_topup_packages_number ON public.auto_topup_packages(topup_number_id);
CREATE INDEX IF NOT EXISTS idx_auto_topup_packages_price ON public.auto_topup_packages(selling_price);

CREATE TRIGGER trg_auto_topup_packages_updated_at
BEFORE UPDATE ON public.auto_topup_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RENEW ANALYTICS RPC
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  today_start timestamptz := date_trunc('day', now());
  week_start timestamptz := date_trunc('week', now());
  month_start timestamptz := date_trunc('month', now());
  year_start timestamptz := date_trunc('year', now());
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
$$;

-- 4. ENABLE REALTIME
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.payment_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.payment_sms_log REPLICA IDENTITY FULL;
ALTER TABLE public.sms_logs REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_queue REPLICA IDENTITY FULL;
ALTER TABLE public.offline_registrations REPLICA IDENTITY FULL;
ALTER TABLE public.auto_topup_numbers REPLICA IDENTITY FULL;
ALTER TABLE public.device_offline_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_receipts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_sms_log; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_queue; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.offline_registrations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.auto_topup_numbers; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.device_offline_alerts; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;