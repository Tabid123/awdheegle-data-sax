-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'moderator', 'user');
CREATE TYPE public.order_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded');
CREATE TYPE public.payment_status AS ENUM ('pending', 'matched', 'unmatched', 'refunded', 'failed');
CREATE TYPE public.device_status AS ENUM ('online', 'offline', 'idle', 'busy');
CREATE TYPE public.sim_status AS ENUM ('active', 'inactive', 'low_balance', 'depleted');

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================================
-- USER ROLES & PERMISSIONS
-- ============================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role IN ('admin', 'super_admin')
  );
$$;

CREATE TABLE public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin')
    OR EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id AND permission_key = _permission);
$$;

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Super admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users see own perms" ON public.admin_permissions FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Super admins manage perms" ON public.admin_permissions FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- PROFILES
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- VERIFIED PHONES & BLOCKED USERS
-- ============================================================================
CREATE TABLE public.verified_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.verified_phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read verified phones" ON public.verified_phones FOR SELECT USING (true);
CREATE POLICY "Public insert verified phones" ON public.verified_phones FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update verified phones" ON public.verified_phones FOR UPDATE USING (true);

CREATE TABLE public.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_by UUID REFERENCES auth.users(id),
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read blocked" ON public.blocked_users FOR SELECT USING (true);
CREATE POLICY "Admins manage blocked" ON public.blocked_users FOR ALL USING (public.is_admin(auth.uid()));

-- ============================================================================
-- PROVIDERS & PACKAGES
-- ============================================================================
CREATE TABLE public.providers_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ussd_code TEXT,
  phone_prefixes TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.providers_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read providers" ON public.providers_config FOR SELECT USING (true);
CREATE POLICY "Admins manage providers" ON public.providers_config FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON public.providers_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.data_packages_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers_config(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price NUMERIC(10,2) NOT NULL,
  data_amount TEXT,
  validity_days INTEGER,
  ussd_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.data_packages_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read packages" ON public.data_packages_config FOR SELECT USING (true);
CREATE POLICY "Admins manage packages" ON public.data_packages_config FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.data_packages_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.package_delivery_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_package_id UUID NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  target_package_id UUID NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  execution_order INTEGER NOT NULL DEFAULT 1,
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.package_delivery_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rules" ON public.package_delivery_rules FOR SELECT USING (true);
CREATE POLICY "Admins manage rules" ON public.package_delivery_rules FOR ALL USING (public.is_admin(auth.uid()));

CREATE TABLE public.payment_providers_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  logo_url TEXT,
  payment_phone TEXT,
  ussd_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_providers_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pay providers" ON public.payment_providers_config FOR SELECT USING (true);
CREATE POLICY "Admins manage pay providers" ON public.payment_providers_config FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_pay_providers_updated_at BEFORE UPDATE ON public.payment_providers_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.delivery_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL,
  reference_id UUID NOT NULL,
  ussd_template TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read instructions" ON public.delivery_instructions FOR SELECT USING (true);
CREATE POLICY "Admins manage instructions" ON public.delivery_instructions FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_instr_updated_at BEFORE UPDATE ON public.delivery_instructions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- DEVICES & SIMS
-- ============================================================================
CREATE TABLE public.android_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  imei TEXT,
  model TEXT,
  android_version TEXT,
  app_version TEXT,
  status public.device_status NOT NULL DEFAULT 'offline',
  last_heartbeat TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.android_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read devices" ON public.android_devices FOR SELECT USING (true);
CREATE POLICY "Public update devices" ON public.android_devices FOR UPDATE USING (true);
CREATE POLICY "Admins manage devices" ON public.android_devices FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.android_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES public.android_devices(id) ON DELETE SET NULL,
  sim_slot INTEGER NOT NULL DEFAULT 1,
  provider_id UUID REFERENCES public.providers_config(id),
  phone_number TEXT NOT NULL,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.sim_status NOT NULL DEFAULT 'active',
  pin TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sims" ON public.sims FOR SELECT USING (true);
CREATE POLICY "Public update sims" ON public.sims FOR UPDATE USING (true);
CREATE POLICY "Admins manage sims" ON public.sims FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_sims_updated_at BEFORE UPDATE ON public.sims FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.device_offline_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.android_devices(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  message TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.device_offline_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read alerts" ON public.device_offline_alerts FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage alerts" ON public.device_offline_alerts FOR ALL USING (public.is_admin(auth.uid()));

-- ============================================================================
-- ORDERS & DELIVERIES
-- ============================================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8),
  provider_id UUID REFERENCES public.providers_config(id),
  package_id UUID REFERENCES public.data_packages_config(id),
  payment_provider_id UUID REFERENCES public.payment_providers_config(id),
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  payment_reference TEXT,
  delivery_notes TEXT,
  device_id UUID REFERENCES public.android_devices(id),
  sim_id UUID REFERENCES public.sims(id),
  is_manual BOOLEAN NOT NULL DEFAULT false,
  is_offline BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update orders" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "Admins delete orders" ON public.orders FOR DELETE USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_sender_phone ON public.orders(sender_phone);
CREATE INDEX idx_orders_receiver_phone ON public.orders(receiver_phone);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);

CREATE TABLE public.delivery_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.data_packages_config(id),
  ussd_command TEXT,
  execution_order INTEGER NOT NULL DEFAULT 1,
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  claimed_by UUID REFERENCES public.android_devices(id),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read queue" ON public.delivery_queue FOR SELECT USING (true);
CREATE POLICY "Public insert queue" ON public.delivery_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update queue" ON public.delivery_queue FOR UPDATE USING (true);
CREATE INDEX idx_queue_status ON public.delivery_queue(status);

CREATE TABLE public.offline_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT,
  provider_id UUID REFERENCES public.providers_config(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.offline_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read offline regs" ON public.offline_registrations FOR SELECT USING (true);
CREATE POLICY "Public insert offline regs" ON public.offline_registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update offline regs" ON public.offline_registrations FOR UPDATE USING (true);
CREATE TRIGGER update_offline_regs_updated_at BEFORE UPDATE ON public.offline_registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.daily_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_date)
);
ALTER TABLE public.daily_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage daily orders" ON public.daily_orders FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_daily_orders_updated_at BEFORE UPDATE ON public.daily_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PAYMENTS & SMS
-- ============================================================================
CREATE TABLE public.payment_sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES public.android_devices(id),
  sim_id UUID REFERENCES public.sims(id),
  raw_sms TEXT NOT NULL,
  sender_phone TEXT,
  amount NUMERIC(12,2),
  reference TEXT,
  matched_order_id UUID REFERENCES public.orders(id),
  status public.payment_status NOT NULL DEFAULT 'pending',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pay sms" ON public.payment_sms_log FOR SELECT USING (true);
CREATE POLICY "Public insert pay sms" ON public.payment_sms_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update pay sms" ON public.payment_sms_log FOR UPDATE USING (true);
CREATE INDEX idx_pay_sms_status ON public.payment_sms_log(status);
CREATE INDEX idx_pay_sms_received ON public.payment_sms_log(received_at DESC);

CREATE TABLE public.unmatched_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_sms_id UUID REFERENCES public.payment_sms_log(id),
  reason TEXT,
  amount NUMERIC(12,2),
  sender_phone TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.unmatched_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage unmatched" ON public.unmatched_payments FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Public insert unmatched" ON public.unmatched_payments FOR INSERT WITH CHECK (true);

CREATE TABLE public.evoucher_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_id UUID REFERENCES public.sims(id),
  voucher_code TEXT,
  amount NUMERIC(12,2) NOT NULL,
  rate NUMERIC(8,4),
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evoucher_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage evoucher" ON public.evoucher_transactions FOR ALL USING (public.is_admin(auth.uid()));

CREATE TABLE public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES public.android_devices(id),
  direction TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sms logs" ON public.sms_logs FOR SELECT USING (true);
CREATE POLICY "Public insert sms logs" ON public.sms_logs FOR INSERT WITH CHECK (true);
CREATE INDEX idx_sms_logs_created ON public.sms_logs(created_at DESC);

CREATE TABLE public.bulk_sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.bulk_sms_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bulk sms" ON public.bulk_sms_campaigns FOR ALL USING (public.is_admin(auth.uid()));

CREATE TABLE public.sms_lacago_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_lacago_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage lacago" ON public.sms_lacago_cards FOR ALL USING (public.is_admin(auth.uid()));

-- ============================================================================
-- SETTINGS & CONFIGS
-- ============================================================================
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage app settings" ON public.app_settings FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.banners_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.banners_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read banners" ON public.banners_config FOR SELECT USING (true);
CREATE POLICY "Admins manage banners" ON public.banners_config FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_banners_updated_at BEFORE UPDATE ON public.banners_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auto_topup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  threshold_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  topup_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_topup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage topup settings" ON public.auto_topup_settings FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_topup_settings_updated_at BEFORE UPDATE ON public.auto_topup_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auto_topup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  package_id UUID REFERENCES public.data_packages_config(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_topup_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage topup rules" ON public.auto_topup_rules FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_topup_rules_updated_at BEFORE UPDATE ON public.auto_topup_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.offline_payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_phone TEXT NOT NULL,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.offline_payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read offline pay" ON public.offline_payment_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage offline pay" ON public.offline_payment_settings FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_offline_pay_updated_at BEFORE UPDATE ON public.offline_payment_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.error_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_key TEXT NOT NULL UNIQUE,
  message_so TEXT NOT NULL,
  message_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.error_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read errors" ON public.error_messages FOR SELECT USING (true);
CREATE POLICY "Admins manage errors" ON public.error_messages FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_errors_updated_at BEFORE UPDATE ON public.error_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone TEXT,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  body TEXT,
  notification_type TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Public insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update notifications" ON public.notifications FOR UPDATE USING (true);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.audit_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Public insert audit" ON public.audit_logs FOR INSERT WITH CHECK (true);

CREATE TABLE public.fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  phone_number TEXT,
  amount NUMERIC(12,2),
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage fraud" ON public.fraud_alerts FOR ALL USING (public.is_admin(auth.uid()));

CREATE TABLE public.company_finances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  category TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.company_finances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage finances" ON public.company_finances FOR ALL USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_next_delivery(_device_id UUID)
RETURNS TABLE(queue_id UUID, order_id UUID, ussd_command TEXT, package_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  SELECT id INTO v_queue_id
  FROM public.delivery_queue
  WHERE status = 'pending'
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.delivery_queue
  SET status = 'processing', claimed_by = _device_id, claimed_at = now()
  WHERE id = v_queue_id;

  RETURN QUERY
  SELECT dq.id, dq.order_id, dq.ussd_command, dq.package_id
  FROM public.delivery_queue dq
  WHERE dq.id = v_queue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_order_history(_phone TEXT)
RETURNS TABLE(
  id UUID, order_number TEXT, sender_phone TEXT, receiver_phone TEXT,
  amount NUMERIC, status public.order_status, package_name TEXT,
  provider_name TEXT, created_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.order_number, o.sender_phone, o.receiver_phone, o.amount, o.status,
         p.package_name, pr.display_name, o.created_at
  FROM public.orders o
  LEFT JOIN public.data_packages_config p ON p.id = o.package_id
  LEFT JOIN public.providers_config pr ON pr.id = o.provider_id
  WHERE o.sender_phone = _phone OR o.receiver_phone = _phone
  ORDER BY o.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.get_featured_packages()
RETURNS TABLE(
  id UUID, package_name TEXT, description TEXT, price NUMERIC,
  data_amount TEXT, provider_name TEXT, logo_url TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.package_name, p.description, p.price, p.data_amount,
         pr.display_name, pr.logo_url
  FROM public.data_packages_config p
  JOIN public.providers_config pr ON pr.id = p.provider_id
  WHERE p.is_featured = true AND p.is_active = true
  ORDER BY p.sort_order ASC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.get_most_purchased_packages()
RETURNS TABLE(
  id UUID, package_name TEXT, description TEXT, price NUMERIC,
  data_amount TEXT, provider_name TEXT, logo_url TEXT, purchase_count INTEGER
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.package_name, p.description, p.price, p.data_amount,
         pr.display_name, pr.logo_url, p.purchase_count
  FROM public.data_packages_config p
  JOIN public.providers_config pr ON pr.id = p.provider_id
  WHERE p.is_active = true
  ORDER BY p.purchase_count DESC
  LIMIT 20;
$$;