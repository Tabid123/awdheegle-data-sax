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
    v_data := NULL;

    SELECT c.selling_price, c.data_amount
    INTO v_price, v_data
    FROM public.ussd_price_catalog c
    WHERE c.is_active
      AND c.root_package_id = v_root_id
      AND c.normalized_label = v_norm
    ORDER BY (c.duration_key IS NOT DISTINCT FROM v_dur) DESC
    LIMIT 1;

    IF v_price IS NULL THEN
      SELECT c.selling_price, c.data_amount
      INTO v_price, v_data
      FROM public.ussd_price_catalog c
      WHERE c.is_active
        AND c.root_package_id = v_root_id
        AND public.ussd_fuzzy_key(c.normalized_label) = v_fuzzy
      ORDER BY (c.duration_key IS NOT DISTINCT FROM v_dur) DESC
      LIMIT 1;
    END IF;

    IF v_price IS NULL THEN
      SELECT c.selling_price, c.data_amount
      INTO v_price, v_data
      FROM public.ussd_price_catalog c
      WHERE c.is_active
        AND (c.normalized_label = v_norm OR public.ussd_fuzzy_key(c.normalized_label) = v_fuzzy)
      ORDER BY (c.normalized_label = v_norm) DESC,
               (c.duration_key IS NOT DISTINCT FROM v_dur) DESC
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