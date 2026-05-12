
-- Auto-cancel sibling delivery_queue rows when one completes for the same order
CREATE OR REPLACE FUNCTION public.cancel_sibling_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.delivery_queue
    SET status = 'cancelled',
        error_message = COALESCE(error_message, 'Superseded by completed retry'),
        completed_at = COALESCE(completed_at, now())
    WHERE order_id = NEW.order_id
      AND id <> NEW.id
      AND status IN ('processing', 'pending', 'queued');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_sibling_deliveries ON public.delivery_queue;
CREATE TRIGGER trg_cancel_sibling_deliveries
AFTER INSERT OR UPDATE OF status ON public.delivery_queue
FOR EACH ROW
EXECUTE FUNCTION public.cancel_sibling_deliveries();

-- One-time cleanup: cancel stuck processing/pending rows where another sibling already completed
UPDATE public.delivery_queue dq
SET status = 'cancelled',
    error_message = COALESCE(dq.error_message, 'Superseded by completed retry'),
    completed_at = COALESCE(dq.completed_at, now())
WHERE dq.status IN ('processing', 'pending', 'queued')
  AND EXISTS (
    SELECT 1 FROM public.delivery_queue dq2
    WHERE dq2.order_id = dq.order_id
      AND dq2.id <> dq.id
      AND dq2.status = 'completed'
  );

-- Also auto-cancel stuck processing rows older than 10 minutes when their order is already delivered
UPDATE public.delivery_queue dq
SET status = 'cancelled',
    error_message = COALESCE(dq.error_message, 'Order already delivered'),
    completed_at = COALESCE(dq.completed_at, now())
WHERE dq.status IN ('processing', 'pending', 'queued')
  AND dq.created_at < now() - interval '10 minutes'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = dq.order_id
      AND o.delivery_status = 'delivered'
  );
