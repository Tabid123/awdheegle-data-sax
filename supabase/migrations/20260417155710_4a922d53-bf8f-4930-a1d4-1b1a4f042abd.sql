
-- 1. delivery_queue legacy columns
ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS ussd_code text,
  ADD COLUMN IF NOT EXISTS receiver_phone text,
  ADD COLUMN IF NOT EXISTS sim_slot integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_code text,
  ADD COLUMN IF NOT EXISTS package_code text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_delivery_queue_ussd()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ussd_command IS NULL AND NEW.ussd_code IS NOT NULL THEN
      NEW.ussd_command := NEW.ussd_code;
    ELSIF NEW.ussd_code IS NULL AND NEW.ussd_command IS NOT NULL THEN
      NEW.ussd_code := NEW.ussd_command;
    END IF;
  ELSE
    IF NEW.ussd_command IS DISTINCT FROM OLD.ussd_command AND NEW.ussd_command IS NOT NULL THEN
      NEW.ussd_code := NEW.ussd_command;
    ELSIF NEW.ussd_code IS DISTINCT FROM OLD.ussd_code AND NEW.ussd_code IS NOT NULL THEN
      NEW.ussd_command := NEW.ussd_code;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_delivery_queue_ussd ON public.delivery_queue;
CREATE TRIGGER trg_sync_delivery_queue_ussd
  BEFORE INSERT OR UPDATE ON public.delivery_queue
  FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_queue_ussd();

UPDATE public.delivery_queue SET ussd_code = ussd_command WHERE ussd_code IS NULL AND ussd_command IS NOT NULL;

-- 2. Drop ALL existing claim_next_delivery overloads, then recreate
DROP FUNCTION IF EXISTS public.claim_next_delivery(uuid, text[]);
DROP FUNCTION IF EXISTS public.claim_next_delivery(uuid);

CREATE OR REPLACE FUNCTION public.claim_next_delivery(
  p_device_id uuid,
  p_providers text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid, order_id uuid, ussd_command text, ussd_code text,
  package_id uuid, provider_name text, receiver_phone text,
  sim_slot integer, attempts integer, package_code text,
  pin_code text, queue_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_queue_id uuid;
BEGIN
  IF p_providers IS NULL OR array_length(p_providers, 1) IS NULL THEN
    SELECT dq.id INTO v_queue_id
    FROM public.delivery_queue dq
    WHERE dq.status = 'pending'
    ORDER BY dq.created_at ASC
    FOR UPDATE SKIP LOCKED LIMIT 1;
  ELSE
    SELECT dq.id INTO v_queue_id
    FROM public.delivery_queue dq
    LEFT JOIN public.data_packages_config p ON p.id = dq.package_id
    LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
    WHERE dq.status = 'pending'
      AND (
        p.id IS NULL
        OR LOWER(pr.provider_name) = ANY(SELECT LOWER(unnest(p_providers)))
        OR LOWER(COALESCE(dq.provider_name, '')) = ANY(SELECT LOWER(unnest(p_providers)))
      )
    ORDER BY dq.created_at ASC
    FOR UPDATE SKIP LOCKED LIMIT 1;
  END IF;

  IF v_queue_id IS NULL THEN RETURN; END IF;

  UPDATE public.delivery_queue
  SET status = 'processing', claimed_by = p_device_id,
      claimed_at = now(), attempts = COALESCE(attempts, 0) + 1
  WHERE id = v_queue_id;

  RETURN QUERY
  SELECT dq.id, dq.order_id, dq.ussd_command,
    COALESCE(dq.ussd_code, dq.ussd_command),
    dq.package_id,
    COALESCE(dq.provider_name, (SELECT LOWER(pr.provider_name) FROM public.providers_config pr JOIN public.data_packages_config p ON p.provider_id = pr.id WHERE p.id = dq.package_id)),
    COALESCE(dq.receiver_phone, (SELECT o.receiver_phone FROM public.orders o WHERE o.id = dq.order_id)),
    COALESCE(dq.sim_slot, 0),
    COALESCE(dq.attempts, 1),
    dq.package_code, dq.pin_code, dq.id
  FROM public.delivery_queue dq
  WHERE dq.id = v_queue_id;
END $$;

-- 3. is_phone_blocked
CREATE OR REPLACE FUNCTION public.is_phone_blocked(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE REGEXP_REPLACE(phone_number, '\D', '', 'g') LIKE '%' || REGEXP_REPLACE(p_phone, '\D', '', 'g')
  );
$$;

ALTER TABLE public.blocked_users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 4. sim_balances legacy columns
ALTER TABLE public.sim_balances
  ADD COLUMN IF NOT EXISTS balance_type text NOT NULL DEFAULT 'evc_plus',
  ADD COLUMN IF NOT EXISTS android_device_id uuid,
  ADD COLUMN IF NOT EXISTS last_updated timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.sync_sim_balances_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.device_id IS NULL AND NEW.android_device_id IS NOT NULL THEN
      NEW.device_id := NEW.android_device_id;
    ELSIF NEW.android_device_id IS NULL AND NEW.device_id IS NOT NULL THEN
      NEW.android_device_id := NEW.device_id;
    END IF;
    IF NEW.last_updated IS NULL THEN NEW.last_updated := NEW.last_updated_at; END IF;
  ELSE
    IF NEW.device_id IS DISTINCT FROM OLD.device_id AND NEW.device_id IS NOT NULL THEN
      NEW.android_device_id := NEW.device_id;
    ELSIF NEW.android_device_id IS DISTINCT FROM OLD.android_device_id AND NEW.android_device_id IS NOT NULL THEN
      NEW.device_id := NEW.android_device_id;
    END IF;
    IF NEW.last_updated IS DISTINCT FROM OLD.last_updated AND NEW.last_updated IS NOT NULL THEN
      NEW.last_updated_at := NEW.last_updated;
    ELSIF NEW.last_updated_at IS DISTINCT FROM OLD.last_updated_at THEN
      NEW.last_updated := NEW.last_updated_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_sim_balances_aliases ON public.sim_balances;
CREATE TRIGGER trg_sync_sim_balances_aliases
  BEFORE INSERT OR UPDATE ON public.sim_balances
  FOR EACH ROW EXECUTE FUNCTION public.sync_sim_balances_aliases();

UPDATE public.sim_balances SET android_device_id = device_id WHERE android_device_id IS NULL AND device_id IS NOT NULL;
UPDATE public.sim_balances SET last_updated = last_updated_at WHERE last_updated IS NULL;

ALTER TABLE public.sim_balances DROP CONSTRAINT IF EXISTS sim_balances_device_id_sim_slot_key;
CREATE UNIQUE INDEX IF NOT EXISTS sim_balances_device_slot_type_uidx
  ON public.sim_balances (device_id, sim_slot, balance_type);
