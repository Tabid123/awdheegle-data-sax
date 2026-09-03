-- 1) Strip price prefixes like "$0.25=" / "18=" before normalizing
CREATE OR REPLACE FUNCTION public.ussd_strip_price_prefix(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.ussd_normalize_label(
    btrim(regexp_replace(
      regexp_replace(
        -- drop everything up to and including the first '=' when it looks like a price tag
        regexp_replace(coalesce(p_text,''), '^\s*(usd\s*)?\$?\s*[0-9]+([\.,][0-9]{1,2})?\s*\$?(usd)?\s*=\s*', '', 'i'),
        '(^|\s)(usd\s*)?\$\s*[0-9]+([\.,][0-9]{1,2})?(\s|$)', ' ', 'gi'),
      '\s+', ' ', 'g')));
$$;

-- 2) Fuzzy key: squash spaces and unify xadidnayn/xadidneyn spelling
CREATE OR REPLACE FUNCTION public.ussd_fuzzy_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT replace(
           regexp_replace(
             replace(replace(public.ussd_strip_price_prefix(p_text), 'xadidneyn', 'xadidnayn'), 'xadidnaeyn', 'xadidnayn'),
             '[^a-z0-9]', '', 'g'),
           ' ', '');
$$;

-- 3) complete_discovery: exact match, then fuzzy match, then unmatched
DROP FUNCTION IF EXISTS public.complete_discovery(uuid, jsonb, text, integer);
CREATE OR REPLACE FUNCTION public.complete_discovery(p_session_id uuid, p_items jsonb, p_raw_text text DEFAULT NULL, p_hold_seconds integer DEFAULT 1800)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it jsonb;
  v_norm text;
  v_fuzzy text;
  v_dur text;
  v_price numeric;
  v_cost numeric;
  v_data text;
  v_out jsonb := '[]'::jsonb;
  v_normalized_labels text[] := ARRAY[]::text[];
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_norm := public.ussd_strip_price_prefix(split_part(COALESCE(it->>'raw_label', ''), '|', 1));
    v_normalized_labels := array_append(v_normalized_labels, v_norm);
  END LOOP;

  IF cardinality(v_normalized_labels) > 0
     AND v_normalized_labels <@ ARRAY['data', 'kuhadal', 'data iyo kuhadal']::text[] THEN
    UPDATE public.ussd_package_discoveries
    SET items = '[]'::jsonb,
        raw_menu_text = COALESCE(p_raw_text, raw_menu_text),
        status = 'failed',
        session_state = 'lost',
        error_message = 'root_menu_captured'
    WHERE id = p_session_id;
    RETURN;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_norm := public.ussd_strip_price_prefix(split_part(COALESCE(it->>'raw_label', ''), '|', 1));
    v_fuzzy := public.ussd_fuzzy_key(split_part(COALESCE(it->>'raw_label', ''), '|', 1));
    v_dur := public.ussd_duration_key(public.ussd_strip_price_prefix(it->>'raw_label'));
    v_price := NULL; v_cost := NULL; v_data := NULL;

    SELECT c.selling_price, c.cost_price, c.data_amount
    INTO v_price, v_cost, v_data
    FROM public.ussd_price_catalog c
    WHERE c.is_active AND c.normalized_label = v_norm
    ORDER BY (c.duration_key IS NOT DISTINCT FROM v_dur) DESC
    LIMIT 1;

    IF v_price IS NULL THEN
      SELECT c.selling_price, c.cost_price, c.data_amount
      INTO v_price, v_cost, v_data
      FROM public.ussd_price_catalog c
      WHERE c.is_active AND public.ussd_fuzzy_key(c.normalized_label) = v_fuzzy
      ORDER BY (c.duration_key IS NOT DISTINCT FROM v_dur) DESC
      LIMIT 1;
    END IF;

    IF v_price IS NULL THEN
      INSERT INTO public.discovery_unmatched_labels(raw_label, normalized_label, duration_key)
      VALUES (split_part(COALESCE(it->>'raw_label', ''), '|', 1), v_norm, v_dur)
      ON CONFLICT (normalized_label, coalesce(duration_key, ''))
      DO UPDATE SET seen_count = public.discovery_unmatched_labels.seen_count + 1,
                    last_seen_at = now(),
                    raw_label = EXCLUDED.raw_label;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'index', it->'index',
      'raw_label', trim(split_part(COALESCE(it->>'raw_label', ''), '|', 1)),
      'normalized_label', v_norm,
      'duration_key', v_dur,
      'data_amount', COALESCE(v_data, it->>'data_amount'),
      'price', v_price,
      'cost_price', v_cost,
      'sellable', v_price IS NOT NULL
    ));
  END LOOP;

  UPDATE public.ussd_package_discoveries
  SET items = v_out,
      raw_menu_text = COALESCE(p_raw_text, raw_menu_text),
      status = 'ready',
      session_state = 'open',
      error_message = NULL,
      session_expires_at = now() + make_interval(secs => p_hold_seconds)
  WHERE id = p_session_id;
END;
$$;