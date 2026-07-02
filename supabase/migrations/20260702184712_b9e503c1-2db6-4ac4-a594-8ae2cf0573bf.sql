
CREATE TABLE public.reversal_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_log_id uuid NULL,
  amount numeric NOT NULL,
  sender_phone text NOT NULL,
  ussd_code text NOT NULL,
  sms_body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz NULL,
  dismissed_by uuid NULL
);

GRANT SELECT, UPDATE ON public.reversal_alerts TO authenticated;
GRANT ALL ON public.reversal_alerts TO service_role;

ALTER TABLE public.reversal_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reversal alerts" ON public.reversal_alerts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can dismiss reversal alerts" ON public.reversal_alerts
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_reversal_alerts_active ON public.reversal_alerts (created_at DESC) WHERE dismissed_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.reversal_alerts;

CREATE OR REPLACE FUNCTION public.sms_logs_detect_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m text[];
  v_amount numeric;
  v_phone text;
  v_ussd text;
BEGIN
  IF NEW.sms_body IS NULL THEN
    RETURN NEW;
  END IF;

  m := regexp_match(
    NEW.sms_body,
    '\$[[:space:]]*([0-9]+(?:\.[0-9]+)?|\.[0-9]+)[[:space:]]+ayaa[[:space:]]+waxaa?[[:space:]]+kaa[[:space:]]+xanibay[[:space:]]+(\+?[0-9]{7,15}).*garaac[[:space:]]+([0-9*#+]+)',
    'i'
  );

  IF m IS NULL THEN
    RETURN NEW;
  END IF;

  v_amount := CASE WHEN left(m[1], 1) = '.' THEN ('0' || m[1])::numeric ELSE m[1]::numeric END;
  v_phone := regexp_replace(m[2], '[^0-9]', '', 'g');
  v_ussd := regexp_replace(m[3], '[^0-9*#+]', '', 'g');

  IF EXISTS (
    SELECT 1 FROM public.reversal_alerts
    WHERE sms_log_id = NEW.id OR sms_body = NEW.sms_body
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.reversal_alerts (sms_log_id, amount, sender_phone, ussd_code, sms_body)
  VALUES (NEW.id, v_amount, v_phone, v_ussd, NEW.sms_body);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sms_logs_detect_reversal
AFTER INSERT ON public.sms_logs
FOR EACH ROW
EXECUTE FUNCTION public.sms_logs_detect_reversal();

-- Backfill
INSERT INTO public.reversal_alerts (sms_log_id, amount, sender_phone, ussd_code, sms_body)
SELECT s.id,
       CASE WHEN left(m[1],1)='.' THEN ('0'||m[1])::numeric ELSE m[1]::numeric END,
       regexp_replace(m[2], '[^0-9]', '', 'g'),
       regexp_replace(m[3], '[^0-9*#+]', '', 'g'),
       s.sms_body
FROM public.sms_logs s
CROSS JOIN LATERAL regexp_match(
  s.sms_body,
  '\$[[:space:]]*([0-9]+(?:\.[0-9]+)?|\.[0-9]+)[[:space:]]+ayaa[[:space:]]+waxaa?[[:space:]]+kaa[[:space:]]+xanibay[[:space:]]+(\+?[0-9]{7,15}).*garaac[[:space:]]+([0-9*#+]+)',
  'i'
) AS m
WHERE s.sms_body ILIKE '%xanibay%' AND s.sms_body ILIKE '%garaac%'
  AND NOT EXISTS (SELECT 1 FROM public.reversal_alerts ra WHERE ra.sms_log_id = s.id);
