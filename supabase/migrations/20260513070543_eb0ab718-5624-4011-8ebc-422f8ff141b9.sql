
ALTER TABLE public.bulk_sms_campaigns
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS sim_slot integer,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS total_recipients integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.bulk_sms_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.bulk_sms_campaigns(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  device_id text,
  sim_slot integer,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_sms_queue_campaign ON public.bulk_sms_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_bulk_sms_queue_device_status ON public.bulk_sms_queue(device_id, status);

ALTER TABLE public.bulk_sms_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage bulk_sms_queue"
    ON public.bulk_sms_queue
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access bulk_sms_queue"
    ON public.bulk_sms_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
