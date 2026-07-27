
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============ bank_credentials ============
CREATE TABLE public.bank_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_credentials TO authenticated;
GRANT ALL ON public.bank_credentials TO service_role;
ALTER TABLE public.bank_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bank credentials" ON public.bank_credentials
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_bank_credentials_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_bank_credentials_updated
BEFORE UPDATE ON public.bank_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_bank_credentials_updated_at();

-- ============ bank_sessions ============
CREATE TABLE public.bank_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.bank_credentials(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bank_sessions TO authenticated;
GRANT ALL ON public.bank_sessions TO service_role;
ALTER TABLE public.bank_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view bank sessions" ON public.bank_sessions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============ bank_transactions ============
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tran_no text NOT NULL,
  tran_date text,
  tran_date_time timestamptz,
  acc_no text,
  customer_name text,
  tran_amt numeric NOT NULL,
  narration text,
  dr_cr text,
  uti text,
  currency_code text,
  rrp_no text,
  tran_desc text,
  tran_type text,
  user_id_field text,
  charge_amt numeric,
  raw_payload jsonb,
  parsed_sender_phone text,
  parsed_receiver_phone text,
  match_status text NOT NULL DEFAULT 'unmatched',
  matched_payment_id uuid REFERENCES public.pending_online_payments(id),
  matched_order_id uuid REFERENCES public.orders(id),
  match_notes text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_match_status_check
    CHECK (match_status IN ('unmatched','matched','manual_matched','ignored_debit','failed_parse'))
);
CREATE UNIQUE INDEX bank_transactions_tran_no_key ON public.bank_transactions(tran_no);
CREATE INDEX bank_transactions_status_created_idx ON public.bank_transactions(match_status, created_at DESC);
CREATE INDEX bank_transactions_sender_idx ON public.bank_transactions(parsed_sender_phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bank transactions" ON public.bank_transactions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transactions;

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.verify_bank_password(p_username text, p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bank_credentials
    WHERE username = p_username
      AND is_active = true
      AND password_hash = extensions.crypt(p_password, password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.set_bank_credential(p_username text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  UPDATE public.bank_credentials SET is_active = false WHERE username <> p_username;

  INSERT INTO public.bank_credentials (username, password_hash, is_active)
  VALUES (p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), true)
  ON CONFLICT (username) DO UPDATE
    SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
        is_active = true,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_bank_password(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_bank_credential(text, text) TO authenticated;
