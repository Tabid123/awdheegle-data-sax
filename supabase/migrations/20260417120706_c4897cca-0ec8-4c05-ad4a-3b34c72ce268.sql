-- Add missing columns to android_devices
ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS is_charging boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_deliveries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_deliveries integer NOT NULL DEFAULT 0;

-- sim_balances table: balance per device + slot
CREATE TABLE IF NOT EXISTS public.sim_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.android_devices(id) ON DELETE CASCADE,
  sim_slot integer NOT NULL DEFAULT 1,
  provider text,
  balance numeric NOT NULL DEFAULT 0,
  last_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (device_id, sim_slot)
);

ALTER TABLE public.sim_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sim_balances" ON public.sim_balances FOR SELECT USING (true);
CREATE POLICY "Public insert sim_balances" ON public.sim_balances FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update sim_balances" ON public.sim_balances FOR UPDATE USING (true);
CREATE POLICY "Admins manage sim_balances" ON public.sim_balances FOR ALL USING (is_admin(auth.uid()));

CREATE TRIGGER update_sim_balances_updated_at
  BEFORE UPDATE ON public.sim_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- payment_receipts table
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.android_devices(id) ON DELETE SET NULL,
  sim_id uuid REFERENCES public.sims(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  sender_phone text,
  amount numeric,
  reference text,
  raw_sms text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  matched boolean NOT NULL DEFAULT false,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read payment_receipts" ON public.payment_receipts FOR SELECT USING (true);
CREATE POLICY "Public insert payment_receipts" ON public.payment_receipts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update payment_receipts" ON public.payment_receipts FOR UPDATE USING (true);
CREATE POLICY "Admins manage payment_receipts" ON public.payment_receipts FOR ALL USING (is_admin(auth.uid()));

-- Enable realtime
ALTER TABLE public.sim_balances REPLICA IDENTITY FULL;
ALTER TABLE public.payment_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.android_devices REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sim_balances;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_receipts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;