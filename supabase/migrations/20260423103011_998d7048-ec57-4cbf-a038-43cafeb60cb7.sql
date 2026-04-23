-- Clean up existing orders where delivery_notes was contaminated with lock-screen / clock junk text
-- captured by the Android accessibility service. These orders actually delivered successfully
-- (delivery_status='delivered'), so we just clear the misleading note.
UPDATE public.orders
SET delivery_notes = NULL
WHERE delivery_notes IS NOT NULL
  AND (
    delivery_notes ~ '^\d{1,2}:\d{2}'
    OR delivery_notes ~ '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s*\d{1,2}\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
  )
  AND delivery_notes !~* '\$|USD|dollar|waxaad|shubtay|haraag|mahadsanid|wareejis|guulaysatay|lambark|shaqayn|voucher|received|sent|balance|bille|dhammays|airtime|waafi';