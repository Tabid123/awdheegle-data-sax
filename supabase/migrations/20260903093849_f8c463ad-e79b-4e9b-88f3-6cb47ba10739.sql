-- 1. enqueue_discovery_delivery: reuse hot session or cold re-dial
CREATE OR REPLACE FUNCTION public.enqueue_discovery_delivery(
  p_order_id uuid,
  p_menu_label text,
  p_menu_index integer DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_session uuid;
  v_queue_id uuid;
  v_provider text;
  v_pkg_ussd text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  -- already queued? do not duplicate
  SELECT id INTO v_queue_id FROM public.delivery_queue
  WHERE order_id = p_order_id AND status IN ('pending','claimed','processing')
  LIMIT 1;
  IF v_queue_id IS NOT NULL THEN
    RETURN v_queue_id;
  END IF;

  v_provider := LOWER(COALESCE(
    (SELECT pr.provider_name FROM public.providers_config pr WHERE pr.id = v_order.provider_id),
    'maamuus'
  ));

  SELECT COALESCE(p.ussd_code, p.ussd_template) INTO v_pkg_ussd
  FROM public.data_packages_config p WHERE p.id = v_order.package_id;

  -- hot session: same receiver phone, still open and not expired
  v_session := p_session_id;
  IF v_session IS NULL THEN
    SELECT d.id INTO v_session
    FROM public.ussd_package_discoveries d
    WHERE d.phone_number = v_order.receiver_phone
      AND d.session_state = 'open'
      AND d.session_expires_at > now()
    ORDER BY d.updated_at DESC
    LIMIT 1;
  ELSE
    -- validate provided session is still usable
    IF NOT EXISTS (
      SELECT 1 FROM public.ussd_package_discoveries d
      WHERE d.id = v_session AND d.session_state = 'open' AND d.session_expires_at > now()
    ) THEN
      v_session := NULL;
    END IF;
  END IF;

  INSERT INTO public.delivery_queue (
    order_id, package_id, provider_name, receiver_phone,
    ussd_code, ussd_command, status, execution_order, delay_seconds,
    discovery_session_id, discovery_menu_label, discovery_menu_index
  ) VALUES (
    p_order_id, v_order.package_id, v_provider, v_order.receiver_phone,
    COALESCE(v_pkg_ussd, '*212*' || v_order.receiver_phone || '#'),
    COALESCE(v_pkg_ussd, '*212*' || v_order.receiver_phone || '#'),
    'pending', 0, 0,
    v_session, p_menu_label, p_menu_index
  ) RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.enqueue_discovery_delivery(uuid, text, integer, uuid) TO anon, authenticated, service_role;

-- 2. trigger: auto-enqueue discovery orders once payment is confirmed
CREATE OR REPLACE FUNCTION public.trg_enqueue_discovery_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_is_discovery boolean;
BEGIN
  IF NEW.package_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.payment_status IS DISTINCT FROM 'matched'::payment_status THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN RETURN NEW; END IF;

  SELECT COALESCE(p.is_discovery_root, false) INTO v_is_discovery
  FROM public.data_packages_config p WHERE p.id = NEW.package_id;

  IF COALESCE(v_is_discovery, false) THEN
    PERFORM public.enqueue_discovery_delivery(NEW.id, NEW.package_name, NULL, NULL);
  END IF;

  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_orders_enqueue_discovery ON public.orders;
CREATE TRIGGER trg_orders_enqueue_discovery
AFTER INSERT OR UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_discovery_delivery();

-- 3. broadcast discovery session changes
CREATE OR REPLACE FUNCTION public.broadcast_discovery_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_notify('discovery_change', json_build_object(
    'id', NEW.id,
    'phone_number', NEW.phone_number,
    'status', NEW.status,
    'session_state', NEW.session_state
  )::text);
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_broadcast_discovery_change ON public.ussd_package_discoveries;
CREATE TRIGGER trg_broadcast_discovery_change
AFTER INSERT OR UPDATE ON public.ussd_package_discoveries
FOR EACH ROW EXECUTE FUNCTION public.broadcast_discovery_change();

ALTER TABLE public.ussd_package_discoveries REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_queue REPLICA IDENTITY FULL;