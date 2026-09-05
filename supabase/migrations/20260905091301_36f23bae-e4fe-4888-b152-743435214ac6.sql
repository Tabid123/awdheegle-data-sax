CREATE OR REPLACE FUNCTION public.resolve_delivery_pin(p_package_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pin text;
  v_cat uuid;
  v_prov uuid;
BEGIN
  IF p_package_id IS NULL THEN RETURN NULL; END IF;

  SELECT NULLIF(btrim(p.sim_password), ''), p.category_id, p.provider_id
    INTO v_pin, v_cat, v_prov
  FROM public.data_packages_config p
  WHERE p.id = p_package_id;

  IF v_pin IS NOT NULL THEN RETURN v_pin; END IF;

  SELECT NULLIF(btrim(di.sim_password), '') INTO v_pin
  FROM public.delivery_instructions di
  WHERE di.package_id = p_package_id
    AND NULLIF(btrim(di.sim_password), '') IS NOT NULL
  ORDER BY di.created_at DESC LIMIT 1;
  IF v_pin IS NOT NULL THEN RETURN v_pin; END IF;

  IF v_cat IS NOT NULL THEN
    SELECT NULLIF(btrim(di.sim_password), '') INTO v_pin
    FROM public.delivery_instructions di
    WHERE di.category_id = v_cat
      AND NULLIF(btrim(di.sim_password), '') IS NOT NULL
    ORDER BY di.created_at DESC LIMIT 1;
    IF v_pin IS NOT NULL THEN RETURN v_pin; END IF;
  END IF;

  IF v_prov IS NOT NULL THEN
    SELECT NULLIF(btrim(di.sim_password), '') INTO v_pin
    FROM public.delivery_instructions di
    WHERE di.provider_id = v_prov
      AND NULLIF(btrim(di.sim_password), '') IS NOT NULL
    ORDER BY di.created_at DESC LIMIT 1;
  END IF;

  RETURN v_pin;
END; $$;

CREATE OR REPLACE FUNCTION public.fill_delivery_pin_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pin_code IS NULL OR btrim(NEW.pin_code) = '' THEN
    NEW.pin_code := public.resolve_delivery_pin(NEW.package_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fill_delivery_pin_code ON public.delivery_queue;
CREATE TRIGGER trg_fill_delivery_pin_code BEFORE INSERT ON public.delivery_queue FOR EACH ROW EXECUTE FUNCTION public.fill_delivery_pin_code();

UPDATE public.delivery_queue dq
SET pin_code = public.resolve_delivery_pin(dq.package_id)
WHERE (dq.pin_code IS NULL OR btrim(dq.pin_code) = '')
  AND dq.status IN ('pending', 'processing', 'scheduled')
  AND public.resolve_delivery_pin(dq.package_id) IS NOT NULL;

REVOKE ALL ON FUNCTION public.resolve_delivery_pin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_delivery_pin(uuid) TO service_role;