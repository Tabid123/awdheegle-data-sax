DROP FUNCTION IF EXISTS public.get_package_discovery(text, integer, uuid);

CREATE OR REPLACE FUNCTION public.get_package_discovery_session(
  p_phone text,
  p_session_id uuid,
  p_max_age_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.ussd_package_discoveries;
  v_phone text;
  v_items jsonb;
  v_ahead int;
BEGIN
  v_phone := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9);

  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE id = p_session_id
    AND phone_number = v_phone
    AND status = 'ready'
    AND updated_at > now() - make_interval(secs => p_max_age_seconds)
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg((it - 'cost_price') - 'provider_price'), '[]'::jsonb)
    INTO v_items
    FROM jsonb_array_elements(COALESCE(v_row.items,'[]'::jsonb)) it;

    RETURN jsonb_build_object(
      'status','ready',
      'session_id',v_row.id,
      'session_state',v_row.session_state,
      'items',v_items,
      'expires_at',v_row.session_expires_at,
      'session_seconds_left',
        GREATEST(0, COALESCE(EXTRACT(EPOCH FROM (v_row.session_expires_at - now()))::int, 0))
    );
  END IF;

  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE id = p_session_id
    AND phone_number = v_phone
    AND status IN ('queued','dialing','pending','processing')
    AND created_at > now() - interval '5 minutes'
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status','none','items','[]'::jsonb);
  END IF;

  SELECT count(*) INTO v_ahead
  FROM public.ussd_package_discoveries d
  WHERE d.status IN ('queued','pending')
    AND d.created_at < v_row.created_at
    AND d.created_at > now() - interval '5 minutes';

  RETURN jsonb_build_object(
    'status',v_row.status,
    'session_id',v_row.id,
    'items','[]'::jsonb,
    'claimed_at',v_row.claimed_at,
    'ahead',v_ahead,
    'queue_position',v_ahead + 1,
    'error_message',v_row.error_message
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_package_discovery_session(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_package_discovery_session(text, uuid, integer) TO anon, authenticated, service_role;