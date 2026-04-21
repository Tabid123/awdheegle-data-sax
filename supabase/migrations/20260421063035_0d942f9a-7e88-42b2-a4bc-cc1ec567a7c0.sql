DROP FUNCTION IF EXISTS public.get_customer_order_history(text);

CREATE OR REPLACE FUNCTION public.get_customer_order_history(_phone text)
 RETURNS TABLE(
   id uuid,
   order_number text,
   sender_phone text,
   receiver_phone text,
   amount numeric,
   selling_price numeric,
   status order_status,
   delivery_status text,
   payment_status payment_status,
   payment_source text,
   paid_via_secret_price boolean,
   package_name text,
   data_amount text,
   validity_days integer,
   provider_name text,
   provider_logo text,
   created_at timestamp with time zone,
   delivered_at timestamp with time zone
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    o.id,
    o.order_number,
    o.sender_phone,
    o.receiver_phone,
    o.amount,
    COALESCE(o.selling_price, o.amount) AS selling_price,
    o.status,
    o.delivery_status,
    o.payment_status,
    o.payment_source,
    o.paid_via_secret_price,
    COALESCE(o.package_name, p.package_name) AS package_name,
    COALESCE(o.data_amount, p.data_amount) AS data_amount,
    p.validity_days,
    pr.display_name AS provider_name,
    pr.logo_url AS provider_logo,
    o.created_at,
    o.delivered_at
  FROM public.orders o
  LEFT JOIN public.data_packages_config p ON p.id = o.package_id
  LEFT JOIN public.providers_config pr ON pr.id = o.provider_id
  WHERE o.sender_phone = _phone OR o.receiver_phone = _phone
  ORDER BY o.created_at DESC
  LIMIT 200;
$function$;