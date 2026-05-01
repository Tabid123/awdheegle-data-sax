-- Saxan provider_name in offline_registrations: align stored label with provider_id (FK to providers_config)
-- Bug: row could have provider_id=Hormuud but provider_name='Somnet' → routed USSD to wrong SIM
-- → carrier replied "Unrecognized mobile number"

UPDATE public.offline_registrations o
SET provider_name = p.provider_name,
    updated_at = now()
FROM public.providers_config p
WHERE o.provider_id = p.id
  AND (
    o.provider_name IS NULL
    OR LOWER(TRIM(o.provider_name)) <> LOWER(TRIM(p.provider_name))
  );

-- Trigger: keep provider_name in sync with provider_id automatically going forward
CREATE OR REPLACE FUNCTION public.sync_offline_registration_provider_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.provider_id IS NOT NULL THEN
    SELECT provider_name INTO NEW.provider_name
    FROM public.providers_config
    WHERE id = NEW.provider_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_offline_registration_provider_name ON public.offline_registrations;
CREATE TRIGGER trg_sync_offline_registration_provider_name
BEFORE INSERT OR UPDATE OF provider_id ON public.offline_registrations
FOR EACH ROW
EXECUTE FUNCTION public.sync_offline_registration_provider_name();