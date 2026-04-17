-- Drop old function and create new one with provider filtering
DROP FUNCTION IF EXISTS public.claim_next_delivery(uuid);
DROP FUNCTION IF EXISTS public.claim_next_delivery(uuid, text[]);

CREATE OR REPLACE FUNCTION public.claim_next_delivery(
  _device_id uuid,
  _providers text[] DEFAULT NULL
)
RETURNS TABLE(queue_id uuid, order_id uuid, ussd_command text, package_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_id UUID;
BEGIN
  -- Find next pending delivery, optionally filtered by provider
  IF _providers IS NULL OR array_length(_providers, 1) IS NULL THEN
    SELECT dq.id INTO v_queue_id
    FROM public.delivery_queue dq
    WHERE dq.status = 'pending'
    ORDER BY dq.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  ELSE
    SELECT dq.id INTO v_queue_id
    FROM public.delivery_queue dq
    LEFT JOIN public.data_packages_config p ON p.id = dq.package_id
    LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
    WHERE dq.status = 'pending'
      AND (
        p.id IS NULL
        OR LOWER(pr.provider_name) = ANY(SELECT LOWER(unnest(_providers)))
      )
    ORDER BY dq.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  END IF;

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
$function$;

-- Add missing column for retry tracking
ALTER TABLE public.delivery_queue 
ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone;