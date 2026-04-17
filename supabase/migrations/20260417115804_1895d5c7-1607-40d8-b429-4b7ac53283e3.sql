-- Compatibility layer: add legacy columns/aliases so existing admin code works
-- All columns are nullable or have defaults to avoid breaking existing rows

-- ============ providers_config ============
ALTER TABLE public.providers_config 
  ADD COLUMN IF NOT EXISTS provider_logo text,
  ADD COLUMN IF NOT EXISTS display_order integer;

-- Sync provider_logo <-> logo_url, display_order <-> sort_order
UPDATE public.providers_config SET provider_logo = logo_url WHERE provider_logo IS NULL;
UPDATE public.providers_config SET display_order = sort_order WHERE display_order IS NULL;

CREATE OR REPLACE FUNCTION public.sync_providers_config_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.provider_logo IS DISTINCT FROM OLD.provider_logo AND NEW.provider_logo IS NOT NULL THEN
    NEW.logo_url := NEW.provider_logo;
  ELSIF NEW.logo_url IS DISTINCT FROM OLD.logo_url THEN
    NEW.provider_logo := NEW.logo_url;
  END IF;
  IF NEW.display_order IS DISTINCT FROM OLD.display_order AND NEW.display_order IS NOT NULL THEN
    NEW.sort_order := NEW.display_order;
  ELSIF NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    NEW.display_order := NEW.sort_order;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_providers_aliases ON public.providers_config;
CREATE TRIGGER trg_sync_providers_aliases
  BEFORE INSERT OR UPDATE ON public.providers_config
  FOR EACH ROW EXECUTE FUNCTION public.sync_providers_config_aliases();

-- ============ payment_providers_config ============
ALTER TABLE public.payment_providers_config
  ADD COLUMN IF NOT EXISTS provider_logo text,
  ADD COLUMN IF NOT EXISTS payment_number text,
  ADD COLUMN IF NOT EXISTS display_order integer;

UPDATE public.payment_providers_config SET provider_logo = logo_url WHERE provider_logo IS NULL;
UPDATE public.payment_providers_config SET payment_number = payment_phone WHERE payment_number IS NULL;
UPDATE public.payment_providers_config SET display_order = sort_order WHERE display_order IS NULL;

CREATE OR REPLACE FUNCTION public.sync_payment_providers_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.provider_logo IS DISTINCT FROM OLD.provider_logo AND NEW.provider_logo IS NOT NULL THEN
    NEW.logo_url := NEW.provider_logo;
  ELSIF NEW.logo_url IS DISTINCT FROM OLD.logo_url THEN
    NEW.provider_logo := NEW.logo_url;
  END IF;
  IF NEW.payment_number IS DISTINCT FROM OLD.payment_number AND NEW.payment_number IS NOT NULL THEN
    NEW.payment_phone := NEW.payment_number;
  ELSIF NEW.payment_phone IS DISTINCT FROM OLD.payment_phone THEN
    NEW.payment_number := NEW.payment_phone;
  END IF;
  IF NEW.display_order IS DISTINCT FROM OLD.display_order AND NEW.display_order IS NOT NULL THEN
    NEW.sort_order := NEW.display_order;
  ELSIF NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    NEW.display_order := NEW.sort_order;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pay_providers_aliases ON public.payment_providers_config;
CREATE TRIGGER trg_sync_pay_providers_aliases
  BEFORE INSERT OR UPDATE ON public.payment_providers_config
  FOR EACH ROW EXECUTE FUNCTION public.sync_payment_providers_aliases();

-- ============ data_packages_config ============
ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS ussd_code text;

UPDATE public.data_packages_config SET selling_price = price WHERE selling_price IS NULL;
UPDATE public.data_packages_config SET display_order = sort_order WHERE display_order IS NULL;
UPDATE public.data_packages_config SET ussd_code = ussd_template WHERE ussd_code IS NULL;

CREATE OR REPLACE FUNCTION public.sync_data_packages_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.selling_price IS DISTINCT FROM OLD.selling_price AND NEW.selling_price IS NOT NULL THEN
    NEW.price := NEW.selling_price;
  ELSIF NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.selling_price := NEW.price;
  END IF;
  IF NEW.display_order IS DISTINCT FROM OLD.display_order AND NEW.display_order IS NOT NULL THEN
    NEW.sort_order := NEW.display_order;
  ELSIF NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    NEW.display_order := NEW.sort_order;
  END IF;
  IF NEW.ussd_code IS DISTINCT FROM OLD.ussd_code AND NEW.ussd_code IS NOT NULL THEN
    NEW.ussd_template := NEW.ussd_code;
  ELSIF NEW.ussd_template IS DISTINCT FROM OLD.ussd_template THEN
    NEW.ussd_code := NEW.ussd_template;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_packages_aliases ON public.data_packages_config;
CREATE TRIGGER trg_sync_packages_aliases
  BEFORE INSERT OR UPDATE ON public.data_packages_config
  FOR EACH ROW EXECUTE FUNCTION public.sync_data_packages_aliases();

-- ============ package_categories ============
ALTER TABLE public.package_categories
  ADD COLUMN IF NOT EXISTS display_order integer;
UPDATE public.package_categories SET display_order = sort_order WHERE display_order IS NULL;

CREATE OR REPLACE FUNCTION public.sync_package_categories_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.display_order IS DISTINCT FROM OLD.display_order AND NEW.display_order IS NOT NULL THEN
    NEW.sort_order := NEW.display_order;
  ELSIF NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    NEW.display_order := NEW.sort_order;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_categories_aliases ON public.package_categories;
CREATE TRIGGER trg_sync_categories_aliases
  BEFORE INSERT OR UPDATE ON public.package_categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_package_categories_aliases();

-- ============ android_devices ============
ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS last_ping_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sim1_provider text,
  ADD COLUMN IF NOT EXISTS sim2_provider text,
  ADD COLUMN IF NOT EXISTS sim_number text,
  ADD COLUMN IF NOT EXISTS sim2_number text,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS battery_level integer;

UPDATE public.android_devices SET last_ping_at = last_heartbeat WHERE last_ping_at IS NULL AND last_heartbeat IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_android_devices_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.last_ping_at IS DISTINCT FROM OLD.last_ping_at AND NEW.last_ping_at IS NOT NULL THEN
    NEW.last_heartbeat := NEW.last_ping_at;
  ELSIF NEW.last_heartbeat IS DISTINCT FROM OLD.last_heartbeat THEN
    NEW.last_ping_at := NEW.last_heartbeat;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_devices_aliases ON public.android_devices;
CREATE TRIGGER trg_sync_devices_aliases
  BEFORE INSERT OR UPDATE ON public.android_devices
  FOR EACH ROW EXECUTE FUNCTION public.sync_android_devices_aliases();

-- ============ orders.delivery_status ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text;
UPDATE public.orders SET delivery_status = status::text WHERE delivery_status IS NULL;

-- ============ stub RPC for admin analytics ============
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_orders', (SELECT count(*) FROM public.orders),
    'total_revenue', COALESCE((SELECT sum(amount) FROM public.orders WHERE status = 'completed'), 0),
    'pending_orders', (SELECT count(*) FROM public.orders WHERE status = 'pending'),
    'completed_orders', (SELECT count(*) FROM public.orders WHERE status = 'completed'),
    'failed_orders', (SELECT count(*) FROM public.orders WHERE status = 'failed'),
    'active_devices', (SELECT count(*) FROM public.android_devices WHERE status = 'online'),
    'total_devices', (SELECT count(*) FROM public.android_devices)
  );
$$;