-- ============ 1. COLUMNS ============
ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS discovery_session_id uuid,
  ADD COLUMN IF NOT EXISTS discovery_menu_label text,
  ADD COLUMN IF NOT EXISTS discovery_menu_index int;

ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS is_ussd_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_discovery_root boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sim_password text;

ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS sim1_subscription_id int,
  ADD COLUMN IF NOT EXISTS sim2_subscription_id int,
  ADD COLUMN IF NOT EXISTS sim1_iccid text,
  ADD COLUMN IF NOT EXISTS sim2_iccid text,
  ADD COLUMN IF NOT EXISTS primary_for_provider text;

-- ============ 2. NORMALIZATION HELPERS ============
CREATE OR REPLACE FUNCTION public.ussd_normalize_label(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(p_text,'')), '^\s*[0-9]{1,2}\s*[\.\)\-:]\s*', '', 'g'),
             '[^a-z0-9 ]', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.ussd_strip_price_prefix(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT public.ussd_normalize_label(
    btrim(regexp_replace(
      regexp_replace(coalesce(p_text,''), '(^|\s)(usd\s*)?\$?\s*[0-9]+([\.,][0-9]{1,2})?\s*\$?(usd)?(\s|$)', ' ', 'gi'),
      '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public.ussd_duration_key(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(coalesce(p_text,'')) ~ '(3\s*(maalin|days?)|saddex\s*maalin)' THEN '3days'
    WHEN lower(coalesce(p_text,'')) ~ '(toddobaad|todobaad|wiig|weekly|week|7\s*(maalin|days?))' THEN 'weekly'
    WHEN lower(coalesce(p_text,'')) ~ '(bisha|bishii|bil|monthly|month|30\s*(maalin|days?))' THEN 'monthly'
    WHEN lower(coalesce(p_text,'')) ~ '(maalin|maalmo|daily|24\s*saac|day)' THEN 'daily'
    WHEN lower(coalesce(p_text,'')) ~ '(saac|hour)' THEN 'hourly'
    ELSE NULL
  END;
$$;

-- ============ 3. TABLES ============
CREATE TABLE IF NOT EXISTS public.ussd_package_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  provider_name text NOT NULL DEFAULT 'maamuus',
  ussd_code text,
  status text NOT NULL DEFAULT 'queued',
  session_state text NOT NULL DEFAULT 'open',
  session_expires_at timestamptz,
  claimed_by uuid,
  claimed_at timestamptz,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_menu_text text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discoveries_phone ON public.ussd_package_discoveries(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discoveries_status ON public.ussd_package_discoveries(status, created_at);
GRANT SELECT, INSERT, UPDATE ON public.ussd_package_discoveries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ussd_package_discoveries TO anon;
GRANT ALL ON public.ussd_package_discoveries TO service_role;
ALTER TABLE public.ussd_package_discoveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read discoveries" ON public.ussd_package_discoveries;
CREATE POLICY "Public read discoveries" ON public.ussd_package_discoveries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert discoveries" ON public.ussd_package_discoveries;
CREATE POLICY "Public insert discoveries" ON public.ussd_package_discoveries FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update discoveries" ON public.ussd_package_discoveries;
CREATE POLICY "Public update discoveries" ON public.ussd_package_discoveries FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS public.ussd_price_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_label text NOT NULL,
  duration_key text,
  data_amount text,
  display_name text,
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_catalog_label ON public.ussd_price_catalog(normalized_label, coalesce(duration_key,''));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_price_catalog TO authenticated;
GRANT SELECT ON public.ussd_price_catalog TO anon;
GRANT ALL ON public.ussd_price_catalog TO service_role;
ALTER TABLE public.ussd_price_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read price catalog" ON public.ussd_price_catalog;
CREATE POLICY "Public read price catalog" ON public.ussd_price_catalog FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage price catalog" ON public.ussd_price_catalog;
CREATE POLICY "Admins manage price catalog" ON public.ussd_price_catalog FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.discovery_unmatched_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_label text NOT NULL,
  normalized_label text NOT NULL,
  duration_key text,
  seen_count int NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unmatched_label ON public.discovery_unmatched_labels(normalized_label, coalesce(duration_key,''));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_unmatched_labels TO authenticated;
GRANT ALL ON public.discovery_unmatched_labels TO service_role;
ALTER TABLE public.discovery_unmatched_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage unmatched labels" ON public.discovery_unmatched_labels;
CREATE POLICY "Admins manage unmatched labels" ON public.discovery_unmatched_labels FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Public read unmatched labels" ON public.discovery_unmatched_labels;
CREATE POLICY "Public read unmatched labels" ON public.discovery_unmatched_labels FOR SELECT USING (true);

-- touch triggers
CREATE OR REPLACE FUNCTION public.ussd_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_discoveries ON public.ussd_package_discoveries;
CREATE TRIGGER trg_touch_discoveries BEFORE UPDATE ON public.ussd_package_discoveries FOR EACH ROW EXECUTE FUNCTION public.ussd_touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_price_catalog ON public.ussd_price_catalog;
CREATE TRIGGER trg_touch_price_catalog BEFORE UPDATE ON public.ussd_price_catalog FOR EACH ROW EXECUTE FUNCTION public.ussd_touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_unmatched ON public.discovery_unmatched_labels;
CREATE TRIGGER trg_touch_unmatched BEFORE UPDATE ON public.discovery_unmatched_labels FOR EACH ROW EXECUTE FUNCTION public.ussd_touch_updated_at();

-- ============ 4. PIN FILL TRIGGER ============
CREATE OR REPLACE FUNCTION public.fill_delivery_pin_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pin text;
BEGIN
  IF NEW.pin_code IS NULL OR btrim(NEW.pin_code) = '' THEN
    SELECT NULLIF(btrim(p.sim_password), '') INTO v_pin
    FROM public.data_packages_config p WHERE p.id = NEW.package_id;
    IF v_pin IS NULL THEN
      SELECT NULLIF(btrim(di.sim_password), '') INTO v_pin
      FROM public.delivery_instructions di
      WHERE di.package_id = NEW.package_id
      ORDER BY di.created_at DESC LIMIT 1;
    END IF;
    NEW.pin_code := v_pin;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fill_delivery_pin_code ON public.delivery_queue;
CREATE TRIGGER trg_fill_delivery_pin_code BEFORE INSERT ON public.delivery_queue FOR EACH ROW EXECUTE FUNCTION public.fill_delivery_pin_code();

-- ============ 5. FINAL OUTCOME RPC ============
CREATE OR REPLACE FUNCTION public.mark_delivery_status(p_queue_id uuid, p_device_id uuid, p_status text, p_response text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid; v_status text;
BEGIN
  v_status := lower(coalesce(p_status,''));
  IF v_status NOT IN ('delivered','failed','verification_required') THEN
    RAISE EXCEPTION 'invalid status %', p_status;
  END IF;
  UPDATE public.delivery_queue
  SET status = v_status,
      provider_response = COALESCE(p_response, provider_response),
      error_message = CASE WHEN v_status = 'failed' THEN COALESCE(p_response, error_message) ELSE error_message END,
      completed_at = now(),
      android_device_id = COALESCE(p_device_id, android_device_id)
  WHERE id = p_queue_id
  RETURNING order_id INTO v_order;

  IF v_order IS NULL THEN RETURN false; END IF;

  UPDATE public.orders o
  SET status = CASE WHEN v_status = 'delivered' THEN 'completed'
                    WHEN v_status = 'failed' THEN 'failed' ELSE o.status END,
      delivery_status = v_status,
      delivered_at = CASE WHEN v_status = 'delivered' THEN now() ELSE o.delivered_at END
  WHERE o.id = v_order;
  RETURN true;
END; $$;

-- ============ 6. RETRY WITH PIN RESET ============
CREATE OR REPLACE FUNCTION public.retry_delivery(p_queue_id uuid, p_force boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dispatched boolean; v_pkg uuid; v_pin text;
BEGIN
  SELECT ussd_dispatched, package_id INTO v_dispatched, v_pkg FROM public.delivery_queue WHERE id = p_queue_id;
  IF v_dispatched IS NULL THEN RETURN false; END IF;
  IF v_dispatched AND NOT p_force THEN
    RAISE EXCEPTION 'delivery already dispatched — confirm possible double delivery';
  END IF;
  SELECT NULLIF(btrim(p.sim_password),'') INTO v_pin FROM public.data_packages_config p WHERE p.id = v_pkg;
  UPDATE public.delivery_queue
  SET status='pending', claimed_by=NULL, claimed_at=NULL, android_device_id=NULL,
      ussd_dispatched=false, dispatched_at=NULL, dispatch_device_id=NULL,
      error_message=NULL, completed_at=NULL, pin_code=COALESCE(v_pin, pin_code)
  WHERE id = p_queue_id;
  RETURN true;
END; $$;

-- ============ 7. DISCOVERY RPCs ============
CREATE OR REPLACE FUNCTION public.get_package_discovery(p_phone text, p_max_age_seconds int DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ussd_package_discoveries; v_phone text;
BEGIN
  v_phone := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9);
  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE phone_number = v_phone AND status = 'ready'
    AND updated_at > now() - make_interval(secs => p_max_age_seconds)
  ORDER BY updated_at DESC LIMIT 1;
  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','ready','session_id',v_row.id,'session_state',v_row.session_state,
      'items',v_row.items,'expires_at',v_row.session_expires_at);
  END IF;

  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE phone_number = v_phone AND status IN ('queued','dialing')
    AND created_at > now() - interval '3 minutes'
  ORDER BY created_at DESC LIMIT 1;
  IF v_row.id IS NULL THEN
    INSERT INTO public.ussd_package_discoveries(phone_number, ussd_code, status, session_state)
    VALUES (v_phone, '*212*' || v_phone || '#', 'queued', 'open')
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('status', v_row.status, 'session_id', v_row.id, 'items', '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.get_discovery_queue_status(p_phone text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('status',d.status,'session_state',d.session_state,
              'item_count', jsonb_array_length(d.items), 'session_id', d.id,
              'updated_at', d.updated_at, 'expires_at', d.session_expires_at)
     FROM public.ussd_package_discoveries d
     WHERE d.phone_number = right(regexp_replace(coalesce(p_phone,''), '\D','','g'),9)
     ORDER BY d.created_at DESC LIMIT 1),
    jsonb_build_object('status','none'));
$$;

CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id uuid)
RETURNS TABLE(session_id uuid, phone_number text, ussd_code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT d.id INTO v_id FROM public.ussd_package_discoveries d
  WHERE d.status = 'queued' AND d.created_at > now() - interval '3 minutes'
  ORDER BY d.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  UPDATE public.ussd_package_discoveries
  SET status='dialing', claimed_by=p_device_id, claimed_at=now()
  WHERE id = v_id;
  RETURN QUERY SELECT d.id, d.phone_number, COALESCE(d.ussd_code, '*212*'||d.phone_number||'#')
  FROM public.ussd_package_discoveries d WHERE d.id = v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_discovery(p_session_id uuid, p_items jsonb, p_raw_text text DEFAULT NULL, p_hold_seconds int DEFAULT 100)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; v_norm text; v_dur text; v_price numeric; v_cost numeric; v_data text; v_out jsonb := '[]'::jsonb;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
    v_norm := public.ussd_strip_price_prefix(it->>'raw_label');
    v_dur  := public.ussd_duration_key(it->>'raw_label');
    v_price := NULL; v_cost := NULL; v_data := NULL;
    SELECT c.selling_price, c.cost_price, c.data_amount INTO v_price, v_cost, v_data
    FROM public.ussd_price_catalog c
    WHERE c.is_active AND c.normalized_label = v_norm
      AND (c.duration_key IS NULL OR c.duration_key = v_dur)
    ORDER BY (c.duration_key = v_dur) DESC LIMIT 1;

    IF v_price IS NULL THEN
      INSERT INTO public.discovery_unmatched_labels(raw_label, normalized_label, duration_key)
      VALUES (COALESCE(it->>'raw_label',''), v_norm, v_dur)
      ON CONFLICT (normalized_label, coalesce(duration_key,''))
      DO UPDATE SET seen_count = public.discovery_unmatched_labels.seen_count + 1,
                    last_seen_at = now(), raw_label = EXCLUDED.raw_label;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'index', it->'index',
      'raw_label', it->>'raw_label',
      'normalized_label', v_norm,
      'duration_key', v_dur,
      'data_amount', COALESCE(v_data, it->>'data_amount'),
      'price', v_price,
      'cost_price', v_cost,
      'sellable', v_price IS NOT NULL
    ));
  END LOOP;

  UPDATE public.ussd_package_discoveries
  SET items = v_out, raw_menu_text = COALESCE(p_raw_text, raw_menu_text),
      status = 'ready', session_state = 'open',
      session_expires_at = now() + make_interval(secs => p_hold_seconds)
  WHERE id = p_session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_discovery_selection(p_device_id uuid)
RETURNS TABLE(queue_id uuid, session_id uuid, menu_index int, discovery_menu_label text, pin_code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q uuid; v_s uuid;
BEGIN
  SELECT dq.id, dq.discovery_session_id INTO v_q, v_s
  FROM public.delivery_queue dq
  JOIN public.ussd_package_discoveries d ON d.id = dq.discovery_session_id
  WHERE dq.status = 'pending' AND dq.ussd_dispatched = false
    AND d.session_state = 'open' AND d.claimed_by = p_device_id
    AND d.session_expires_at > now()
  ORDER BY dq.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_q IS NULL THEN RETURN; END IF;

  UPDATE public.ussd_package_discoveries SET session_state='delivering' WHERE id = v_s;
  UPDATE public.delivery_queue
  SET status='claimed', claimed_by=p_device_id, android_device_id=p_device_id, claimed_at=now(),
      attempts = COALESCE(attempts,0)+1
  WHERE id = v_q;

  RETURN QUERY SELECT dq.id, dq.discovery_session_id, dq.discovery_menu_index, dq.discovery_menu_label, dq.pin_code
  FROM public.delivery_queue dq WHERE dq.id = v_q;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_discovery_selection(p_queue_id uuid, p_success boolean, p_response text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid;
BEGIN
  SELECT discovery_session_id INTO v_session FROM public.delivery_queue WHERE id = p_queue_id;
  PERFORM public.mark_delivery_status(p_queue_id, NULL, CASE WHEN p_success THEN 'delivered' ELSE 'failed' END, p_response);
  IF v_session IS NOT NULL THEN
    UPDATE public.ussd_package_discoveries SET session_state='consumed' WHERE id = v_session;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.discovery_session_lost(p_session_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET session_state='lost', status = CASE WHEN status='ready' THEN status ELSE 'failed' END,
      error_message = COALESCE(p_reason, error_message)
  WHERE id = p_session_id;

  UPDATE public.delivery_queue
  SET status='pending', claimed_by=NULL, claimed_at=NULL
  WHERE discovery_session_id = p_session_id AND ussd_dispatched = false AND status IN ('claimed','processing');
END; $$;

CREATE OR REPLACE FUNCTION public.discovery_delivery_fallback(p_queue_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_label text;
BEGIN
  SELECT right(regexp_replace(COALESCE(dq.receiver_phone,''), '\D','','g'),9), dq.discovery_menu_label
  INTO v_phone, v_label FROM public.delivery_queue dq WHERE dq.id = p_queue_id;
  IF v_phone IS NULL THEN RETURN; END IF;
  UPDATE public.delivery_queue
  SET ussd_code = '*212*'||v_phone||'#'||CASE WHEN v_label IS NOT NULL THEN '|'||v_label ELSE '' END,
      ussd_command = '*212*'||v_phone||'#'||CASE WHEN v_label IS NOT NULL THEN '|'||v_label ELSE '' END,
      discovery_session_id = NULL, status='pending', claimed_by=NULL, claimed_at=NULL,
      ussd_dispatched=false, dispatched_at=NULL, dispatch_device_id=NULL
  WHERE id = p_queue_id;
END; $$;

-- ============ 8. CLAIM WITH PRIMARY DEVICE RESERVATION ============
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id uuid, p_providers text[] DEFAULT NULL)
RETURNS TABLE(id uuid, order_id uuid, ussd_command text, ussd_code text, package_id uuid, provider_name text, receiver_phone text, sim_slot integer, attempts integer, package_code text, pin_code text, queue_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_queue_id uuid;
BEGIN
  IF p_providers IS NULL OR array_length(p_providers, 1) IS NULL THEN RETURN; END IF;

  SELECT dq.id INTO v_queue_id
  FROM public.delivery_queue dq
  WHERE dq.status = 'pending'
    AND dq.dispatched_at IS NULL
    AND COALESCE(dq.attempts, 0) < 3
    AND (dq.scheduled_at IS NULL OR dq.scheduled_at <= now())
    AND dq.provider_name IS NOT NULL
    AND dq.discovery_session_id IS NULL
    AND LOWER(dq.provider_name) IN (SELECT LOWER(x) FROM unnest(p_providers) AS x)
    AND NOT EXISTS (
      SELECT 1 FROM public.android_devices ad
      WHERE ad.is_active AND ad.archived_at IS NULL
        AND ad.primary_for_provider IS NOT NULL
        AND LOWER(ad.primary_for_provider) = LOWER(dq.provider_name)
        AND ad.id <> p_device_id
        AND ad.last_heartbeat > now() - interval '90 seconds'
    )
  ORDER BY dq.created_at ASC
  FOR UPDATE SKIP LOCKED LIMIT 1;

  IF v_queue_id IS NULL THEN RETURN; END IF;

  UPDATE public.delivery_queue dq
  SET status = 'processing', claimed_by = p_device_id, android_device_id = p_device_id,
      claimed_at = now(), last_attempt_at = now(), attempts = COALESCE(dq.attempts, 0) + 1
  WHERE dq.id = v_queue_id;

  RETURN QUERY
  SELECT dq.id, dq.order_id, dq.ussd_command, COALESCE(dq.ussd_code, dq.ussd_command), dq.package_id,
    COALESCE(dq.provider_name, (SELECT LOWER(pr.provider_name) FROM public.providers_config pr JOIN public.data_packages_config p ON p.provider_id = pr.id WHERE p.id = dq.package_id)),
    COALESCE(dq.receiver_phone, (SELECT o.receiver_phone FROM public.orders o WHERE o.id = dq.order_id)),
    GREATEST(COALESCE(dq.sim_slot, 1) - 1, 0),
    COALESCE(dq.attempts, 1), dq.package_code, dq.pin_code, dq.id
  FROM public.delivery_queue dq WHERE dq.id = v_queue_id;
END; $$;

-- ============ 9. REALTIME ============
ALTER TABLE public.ussd_package_discoveries REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ussd_package_discoveries;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;