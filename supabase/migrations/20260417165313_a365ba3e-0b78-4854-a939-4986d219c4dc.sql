-- Add android_device_id column as alias for claimed_by
ALTER TABLE public.delivery_queue 
ADD COLUMN IF NOT EXISTS android_device_id uuid;

-- Backfill from claimed_by
UPDATE public.delivery_queue SET android_device_id = claimed_by WHERE android_device_id IS NULL AND claimed_by IS NOT NULL;

-- Create sync trigger to keep both columns in sync
CREATE OR REPLACE FUNCTION public.sync_delivery_queue_device_alias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.android_device_id IS NULL AND NEW.claimed_by IS NOT NULL THEN
      NEW.android_device_id := NEW.claimed_by;
    ELSIF NEW.claimed_by IS NULL AND NEW.android_device_id IS NOT NULL THEN
      NEW.claimed_by := NEW.android_device_id;
    END IF;
  ELSE
    IF NEW.android_device_id IS DISTINCT FROM OLD.android_device_id THEN
      NEW.claimed_by := NEW.android_device_id;
    ELSIF NEW.claimed_by IS DISTINCT FROM OLD.claimed_by THEN
      NEW.android_device_id := NEW.claimed_by;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS sync_delivery_queue_device_alias_trg ON public.delivery_queue;
CREATE TRIGGER sync_delivery_queue_device_alias_trg
BEFORE INSERT OR UPDATE ON public.delivery_queue
FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_queue_device_alias();