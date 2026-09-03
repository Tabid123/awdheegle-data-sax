CREATE OR REPLACE FUNCTION public.request_package_discovery(p_root_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
  v_row public.ussd_package_discoveries;
  v_label text;
BEGIN
  v_phone := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9);
  IF length(v_phone) < 9 THEN
    RETURN jsonb_build_object('status','error','message','Lambar sax ah geli');
  END IF;

  SELECT package_name INTO v_label
  FROM public.data_packages_config
  WHERE id = p_root_id AND is_discovery_root = true AND is_active = true;

  IF v_label IS NULL THEN
    RETURN jsonb_build_object('status','error','message','Nooca xirmada lama helin');
  END IF;

  UPDATE public.ussd_package_discoveries
  SET session_state = 'lost',
      status = CASE WHEN status IN ('queued','pending','dialing','processing') THEN 'failed' ELSE status END,
      session_expires_at = now(),
      error_message = CASE WHEN status IN ('queued','pending','dialing','processing') THEN 'replaced_by_new_search' ELSE error_message END,
      updated_at = now()
  WHERE phone_number = v_phone
    AND root_package_id IS NOT DISTINCT FROM p_root_id
    AND session_state IN ('open','selected','delivering');

  INSERT INTO public.ussd_package_discoveries(
    phone_number, ussd_code, status, session_state, root_package_id, menu1_label, items
  )
  VALUES (
    v_phone, '*212*'||v_phone||'#', 'queued', 'open', p_root_id, v_label, '[]'::jsonb
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'status', v_row.status,
    'session_id', v_row.id,
    'session_state', v_row.session_state
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_package_discovery(
  p_phone text,
  p_max_age_seconds integer DEFAULT 90,
  p_session_id uuid DEFAULT NULL
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
  WHERE phone_number = v_phone
    AND (p_session_id IS NULL OR id = p_session_id)
    AND status = 'ready'
    AND updated_at > now() - make_interval(secs => p_max_age_seconds)
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg((it - 'cost_price') - 'provider_price'),
      '[]'::jsonb
    )
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
  WHERE phone_number = v_phone
    AND (p_session_id IS NULL OR id = p_session_id)
    AND status IN ('queued','dialing','pending','processing')
    AND created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC
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

CREATE OR REPLACE FUNCTION public.complete_discovery(
  p_session_id uuid,
  p_items jsonb,
  p_raw_text text DEFAULT NULL,
  p_hold_seconds integer DEFAULT 1800
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  it jsonb;
  v_norm text;
  v_fuzzy text;
  v_dur text;
  v_price numeric;
  v_cost numeric;
  v_data text;
  v_clean_label text;
  v_root_id uuid;
  v_out jsonb := '[]'::jsonb;
  v_normalized_labels text[] := ARRAY[]::text[];
BEGIN
  SELECT root_package_id INTO v_root_id
  FROM public.ussd_package_discoveries
  WHERE id = p_session_id;

  IF v_root_id IS NULL THEN
    RAISE EXCEPTION 'Discovery session not found or has no category';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_clean_label := public.ussd_strip_price_prefix(split_part(COALESCE(it->>'raw_label', ''), '|', 1));
    v_norm := public.ussd_normalize_label(v_clean_label);
    v_normalized_labels := array_append(v_normalized_labels, v_norm);
  END LOOP;

  IF cardinality(v_normalized_labels) > 0
     AND v_normalized_labels <@ ARRAY['data', 'kuhadal', 'data iyo kuhadal']::text[] THEN
    UPDATE public.ussd_package_discoveries
    SET items = '[]'::jsonb,
        raw_menu_text = COALESCE(p_raw_text, raw_menu_text),
        status = 'failed',
        session_state = 'lost',
        error_message = 'root_menu_captured',
        updated_at = now()
    WHERE id = p_session_id;
    RETURN;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_clean_label := public.ussd_strip_price_prefix(split_part(COALESCE(it->>'raw_label', ''), '|', 1));
    v_norm := public.ussd_normalize_label(v_clean_label);
    v_fuzzy := public.ussd_fuzzy_key(v_clean_label);
    v_dur := public.ussd_duration_key(v_clean_label);
    v_price := NULL;
    v_cost := NULL;
    v_data := NULL;

    SELECT c.selling_price, c.cost_price, c.data_amount
    INTO v_price, v_cost, v_data
    FROM public.ussd_price_catalog c
    WHERE c.is_active
      AND c.root_package_id = v_root_id
      AND c.normalized_label = v_norm
    ORDER BY (c.duration_key IS NOT DISTINCT FROM v_dur) DESC
    LIMIT 1;

    IF v_price IS NULL THEN
      SELECT c.selling_price, c.cost_price, c.data_amount
      INTO v_price, v_cost, v_data
      FROM public.ussd_price_catalog c
      WHERE c.is_active
        AND c.root_package_id = v_root_id
        AND public.ussd_fuzzy_key(c.normalized_label) = v_fuzzy
      ORDER BY (c.duration_key IS NOT DISTINCT FROM v_dur) DESC
      LIMIT 1;
    END IF;

    IF v_price IS NULL THEN
      INSERT INTO public.discovery_unmatched_labels(raw_label, normalized_label, duration_key)
      VALUES (v_clean_label, v_norm, v_dur)
      ON CONFLICT (normalized_label, coalesce(duration_key, ''))
      DO UPDATE SET seen_count = public.discovery_unmatched_labels.seen_count + 1,
                    last_seen_at = now(),
                    raw_label = EXCLUDED.raw_label;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'index',it->'index',
      'raw_label',v_clean_label,
      'normalized_label',v_norm,
      'duration_key',v_dur,
      'data_amount',COALESCE(v_data,it->>'data_amount'),
      'price',v_price,
      'sellable',v_price IS NOT NULL
    ));
  END LOOP;

  UPDATE public.ussd_package_discoveries
  SET items = v_out,
      raw_menu_text = COALESCE(p_raw_text, raw_menu_text),
      status = 'ready',
      session_state = 'open',
      error_message = NULL,
      session_expires_at = now() + make_interval(secs => p_hold_seconds),
      updated_at = now()
  WHERE id = p_session_id;
END;
$function$;