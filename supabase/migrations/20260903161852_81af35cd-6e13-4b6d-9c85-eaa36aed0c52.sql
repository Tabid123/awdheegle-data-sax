DELETE FROM public.discovery_unmatched_labels l
WHERE l.normalized_label IN ('data','kuhadal','data iyo kuhadal')
   OR EXISTS (
     SELECT 1 FROM public.ussd_price_catalog c
     WHERE c.is_active
       AND (c.normalized_label = l.normalized_label
            OR public.ussd_fuzzy_key(c.normalized_label) = public.ussd_fuzzy_key(l.raw_label))
   );