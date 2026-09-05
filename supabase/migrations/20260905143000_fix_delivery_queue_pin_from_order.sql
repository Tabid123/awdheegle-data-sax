-- Fix delivery_queue PIN resolution when queue.package_id is NULL.
--
-- Orders already carry the selected package in orders.package_id. Some queue rows
-- are created without copying that value, so the original trigger called
-- resolve_delivery_pin(NULL) and left pin_code empty.
--
-- This migration keeps the existing PIN precedence in resolve_delivery_pin():
-- data_packages_config.sim_password -> package/category/provider delivery instructions.
-- It only fixes how the effective package is selected for delivery_queue.

CREATE OR REPLACE FUNCTION public.fill_delivery_pin_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_id uuid;
  v_pin text;
BEGIN
  -- Prefer the package explicitly assigned to the queue. If it is missing,
  -- inherit the package selected by the source order.
  v_package_id := NEW.package_id;

  IF v_package_id IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT o.package_id
      INTO v_package_id
    FROM public.orders o
    WHERE o.id = NEW.order_id;
  END IF;

  -- Persist the recovered package on the queue so Android/backend diagnostics
  -- see the same package that was used to resolve the PIN.
  IF NEW.package_id IS NULL AND v_package_id IS NOT NULL THEN
    NEW.package_id := v_package_id;
  END IF;

  -- Never replace an explicitly supplied queue PIN.
  IF NEW.pin_code IS NULL OR btrim(NEW.pin_code) = '' THEN
    v_pin := public.resolve_delivery_pin(v_package_id);

    -- Android accepts numeric carrier PINs from 3 to 12 digits. Invalid config
    -- is intentionally left NULL rather than guessing a fallback PIN.
    IF v_pin IS NOT NULL AND btrim(v_pin) ~ '^[0-9]{3,12}$' THEN
      NEW.pin_code := btrim(v_pin);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger so the same protection also applies when an existing
-- queue row is later assigned an order/package or has an empty PIN cleared.
DROP TRIGGER IF EXISTS trg_fill_delivery_pin_code ON public.delivery_queue;

CREATE TRIGGER trg_fill_delivery_pin_code
BEFORE INSERT OR UPDATE OF package_id, order_id, pin_code
ON public.delivery_queue
FOR EACH ROW
EXECUTE FUNCTION public.fill_delivery_pin_code();

-- Backfill active rows created before this fix. package_id is inherited only
-- when absent; an explicitly assigned queue package is never overwritten.
UPDATE public.delivery_queue AS dq
SET
  package_id = COALESCE(dq.package_id, o.package_id),
  pin_code = CASE
    WHEN dq.pin_code IS NULL OR btrim(dq.pin_code) = '' THEN
      CASE
        WHEN public.resolve_delivery_pin(COALESCE(dq.package_id, o.package_id)) ~ '^[0-9]{3,12}$'
          THEN btrim(public.resolve_delivery_pin(COALESCE(dq.package_id, o.package_id)))
        ELSE dq.pin_code
      END
    ELSE dq.pin_code
  END
FROM public.orders AS o
WHERE o.id = dq.order_id
  AND dq.status IN ('pending', 'processing', 'scheduled')
  AND (
    dq.package_id IS NULL
    OR dq.pin_code IS NULL
    OR btrim(dq.pin_code) = ''
  );

-- Keep the trigger function private to normal clients. It is invoked by the
-- table trigger and does not need direct public execution.
REVOKE ALL ON FUNCTION public.fill_delivery_pin_code() FROM PUBLIC;
