
CREATE TABLE IF NOT EXISTS public.pending_online_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verified_phone TEXT,
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  provider_id UUID,
  package_id UUID,
  payment_provider TEXT,
  expected_amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  matched_order_id UUID,
  matched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_online_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert pending payments"
  ON public.pending_online_payments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read own pending payments"
  ON public.pending_online_payments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can update pending payments"
  ON public.pending_online_payments FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete pending payments"
  ON public.pending_online_payments FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pending_online_payments_status
  ON public.pending_online_payments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_online_payments_sender
  ON public.pending_online_payments(sender_phone, expected_amount, status);

CREATE TRIGGER update_pending_online_payments_updated_at
  BEFORE UPDATE ON public.pending_online_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
