-- Add missing columns to payment_receipts
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS tx_id text,
  ADD COLUMN IF NOT EXISTS matched_order_id uuid,
  ADD COLUMN IF NOT EXISTS matching_strategy text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS sms_body text,
  ADD COLUMN IF NOT EXISTS receiver_sim text;

-- Backfill sms_body from raw_sms for existing rows
UPDATE public.payment_receipts SET sms_body = raw_sms WHERE sms_body IS NULL AND raw_sms IS NOT NULL;

-- Unique index on tx_id for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_tx_id_unique ON public.payment_receipts(tx_id) WHERE tx_id IS NOT NULL;

-- Add missing columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS data_amount text,
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS payment_number text,
  ADD COLUMN IF NOT EXISTS payment_source text,
  ADD COLUMN IF NOT EXISTS tx_id text;

-- Unique index on orders.tx_id for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS orders_tx_id_unique ON public.orders(tx_id) WHERE tx_id IS NOT NULL;

-- Add missing columns to payment_sms_log used by edge function
ALTER TABLE public.payment_sms_log
  ADD COLUMN IF NOT EXISTS tx_id text,
  ADD COLUMN IF NOT EXISTS sms_body text,
  ADD COLUMN IF NOT EXISTS receiver_sim text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS matching_strategy text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS payment_sms_log_tx_id_unique ON public.payment_sms_log(tx_id) WHERE tx_id IS NOT NULL;

-- Add missing columns to delivery_queue used by edge function
ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS delivery_count integer DEFAULT 1;

-- Auto-mirror raw_sms ↔ sms_body and reference ↔ tx_id on payment_receipts
CREATE OR REPLACE FUNCTION public.sync_payment_receipts_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.raw_sms IS NULL AND NEW.sms_body IS NOT NULL THEN NEW.raw_sms := NEW.sms_body; END IF;
    IF NEW.sms_body IS NULL AND NEW.raw_sms IS NOT NULL THEN NEW.sms_body := NEW.raw_sms; END IF;
    IF NEW.reference IS NULL AND NEW.tx_id IS NOT NULL THEN NEW.reference := NEW.tx_id; END IF;
    IF NEW.tx_id IS NULL AND NEW.reference IS NOT NULL THEN NEW.tx_id := NEW.reference; END IF;
    IF NEW.order_id IS NULL AND NEW.matched_order_id IS NOT NULL THEN NEW.order_id := NEW.matched_order_id; END IF;
    IF NEW.matched_order_id IS NULL AND NEW.order_id IS NOT NULL THEN NEW.matched_order_id := NEW.order_id; END IF;
  ELSE
    IF NEW.matched_order_id IS DISTINCT FROM OLD.matched_order_id AND NEW.matched_order_id IS NOT NULL THEN NEW.order_id := NEW.matched_order_id; END IF;
    IF NEW.order_id IS DISTINCT FROM OLD.order_id AND NEW.order_id IS NOT NULL THEN NEW.matched_order_id := NEW.order_id; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_payment_receipts_aliases_tg ON public.payment_receipts;
CREATE TRIGGER sync_payment_receipts_aliases_tg
BEFORE INSERT OR UPDATE ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.sync_payment_receipts_aliases();

-- Auto-mirror selling_price ↔ amount on orders
CREATE OR REPLACE FUNCTION public.sync_orders_amount_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.amount IS NULL AND NEW.selling_price IS NOT NULL THEN NEW.amount := NEW.selling_price; END IF;
    IF NEW.selling_price IS NULL AND NEW.amount IS NOT NULL THEN NEW.selling_price := NEW.amount; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_orders_amount_aliases_tg ON public.orders;
CREATE TRIGGER sync_orders_amount_aliases_tg
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_orders_amount_aliases();