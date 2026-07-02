
CREATE TABLE public.sim_card_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  full_name text NOT NULL,
  mother_name text,
  guarantor_phone text,
  sim_provider text,
  sim_number text NOT NULL,
  sim_type text,
  price numeric NOT NULL DEFAULT 0,
  payment_provider text,
  payment_phone text,
  payment_status text NOT NULL DEFAULT 'pending',
  order_status text NOT NULL DEFAULT 'new',
  waafipay_transaction_id text,
  waafipay_reference_id text,
  waafipay_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.sim_card_orders TO authenticated;
GRANT SELECT, INSERT ON public.sim_card_orders TO anon;
GRANT ALL ON public.sim_card_orders TO service_role;

ALTER TABLE public.sim_card_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert sim card orders"
  ON public.sim_card_orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own sim card orders"
  ON public.sim_card_orders FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can update sim card orders"
  ON public.sim_card_orders FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_sim_card_orders_updated_at
  BEFORE UPDATE ON public.sim_card_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
