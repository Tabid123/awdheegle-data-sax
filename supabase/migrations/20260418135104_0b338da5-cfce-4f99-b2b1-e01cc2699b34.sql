-- Backfill: dalabyada queue-koodu si guul leh u dhammaaday lakiin status-kodu weli yahay pending
UPDATE orders o
SET status = 'completed',
    delivery_status = 'delivered',
    delivered_at = COALESCE(o.delivered_at, dq.completed_at)
FROM delivery_queue dq
WHERE dq.order_id = o.id
  AND dq.status = 'completed'
  AND o.status = 'pending';