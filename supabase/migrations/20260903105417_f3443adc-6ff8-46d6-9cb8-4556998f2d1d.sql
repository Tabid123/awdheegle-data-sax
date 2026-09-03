
ALTER TABLE public.ussd_package_discoveries
  ADD COLUMN IF NOT EXISTS root_package_id uuid REFERENCES public.data_packages_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS menu1_label text;

DROP FUNCTION IF EXISTS public.claim_next_discovery(uuid);
CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id uuid)
RETURNS TABLE(session_id uuid, phone_number text, ussd_code text, menu1_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT d.id INTO v_id FROM public.ussd_package_discoveries d
  WHERE d.status = 'queued' AND d.created_at > now() - interval '3 minutes'
  ORDER BY d.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  UPDATE public.ussd_package_discoveries
  SET status='dialing', claimed_by=p_device_id, claimed_at=now()
  WHERE id = v_id;
  RETURN QUERY SELECT d.id, d.phone_number,
    COALESCE(d.ussd_code, '*212*'||d.phone_number||'#'), d.menu1_label
  FROM public.ussd_package_discoveries d WHERE d.id = v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.request_package_discovery(p_root_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_phone text; v_row public.ussd_package_discoveries; v_label text;
BEGIN
  v_phone := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9);
  IF length(v_phone) < 9 THEN
    RETURN jsonb_build_object('status','error','message','Lambar sax ah geli');
  END IF;

  SELECT package_name INTO v_label FROM public.data_packages_config WHERE id = p_root_id;

  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE phone_number = v_phone
    AND (root_package_id = p_root_id OR root_package_id IS NULL)
    AND status = 'ready' AND session_state = 'open'
    AND updated_at > now() - interval '3 minutes'
  ORDER BY updated_at DESC LIMIT 1;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.ussd_package_discoveries
    WHERE phone_number = v_phone AND root_package_id IS NOT DISTINCT FROM p_root_id
      AND status IN ('queued','dialing')
      AND created_at > now() - interval '3 minutes'
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.ussd_package_discoveries(phone_number, ussd_code, status, session_state,
                                                root_package_id, menu1_label)
    VALUES (v_phone, '*212*'||v_phone||'#', 'queued', 'open', p_root_id, v_label)
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('status', v_row.status, 'session_id', v_row.id,
                            'session_state', v_row.session_state);
END; $function$;

CREATE OR REPLACE FUNCTION public.release_discovery_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET session_state = 'lost', status = CASE WHEN status = 'ready' THEN 'expired' ELSE status END,
      session_expires_at = now()
  WHERE id = p_session_id AND session_state = 'open';
END; $function$;

CREATE OR REPLACE FUNCTION public.get_package_discovery(p_phone text, p_max_age_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.ussd_package_discoveries; v_phone text; v_items jsonb;
BEGIN
  v_phone := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9);
  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE phone_number = v_phone AND status = 'ready'
    AND updated_at > now() - make_interval(secs => p_max_age_seconds)
  ORDER BY updated_at DESC LIMIT 1;
  IF v_row.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(it - 'cost_price'), '[]'::jsonb) INTO v_items
    FROM jsonb_array_elements(COALESCE(v_row.items,'[]'::jsonb)) it;
    RETURN jsonb_build_object('status','ready','session_id',v_row.id,'session_state',v_row.session_state,
      'items', v_items, 'expires_at', v_row.session_expires_at);
  END IF;

  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE phone_number = v_phone AND status IN ('queued','dialing')
    AND created_at > now() - interval '3 minutes'
  ORDER BY created_at DESC LIMIT 1;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status','none','items','[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('status', v_row.status, 'session_id', v_row.id, 'items', '[]'::jsonb);
END; $function$;

GRANT EXECUTE ON FUNCTION public.request_package_discovery(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_discovery_session(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_package_discovery(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_discovery_queue_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_discovery(uuid) TO anon, authenticated;
