-- Backfill pending delivery_queue rows oo aan lahayn provider_name/receiver_phone/sim_slot
-- si claim_next_delivery uu Android-ka u siiyo. Sidoo kale dib-u-dhis USSD si ay u
-- isticmaasho cost_price + delivery_instructions template (saxda ah).

WITH ctx AS (
  SELECT 
    dq.id AS queue_id,
    dq.order_id,
    o.receiver_phone AS o_receiver,
    o.provider_id,
    o.package_id,
    p.cost_price,
    p.category_id,
    LOWER(pr.provider_name) AS provider_slug,
    COALESCE(
      (SELECT di.code_template FROM public.delivery_instructions di
        WHERE di.provider_id = o.provider_id AND di.package_id = o.package_id
        LIMIT 1),
      (SELECT di.code_template FROM public.delivery_instructions di
        WHERE di.provider_id = o.provider_id AND di.category_id = p.category_id AND di.package_id IS NULL
        LIMIT 1),
      (SELECT di.code_template FROM public.delivery_instructions di
        WHERE di.provider_id = o.provider_id AND di.category_id IS NULL AND di.package_id IS NULL
        LIMIT 1)
    ) AS code_template,
    COALESCE(
      (SELECT di.sim_password FROM public.delivery_instructions di
        WHERE di.provider_id = o.provider_id AND di.package_id = o.package_id
        LIMIT 1),
      (SELECT di.sim_password FROM public.delivery_instructions di
        WHERE di.provider_id = o.provider_id AND di.category_id = p.category_id AND di.package_id IS NULL
        LIMIT 1),
      (SELECT di.sim_password FROM public.delivery_instructions di
        WHERE di.provider_id = o.provider_id AND di.category_id IS NULL AND di.package_id IS NULL
        LIMIT 1),
      '5516'
    ) AS sim_password
  FROM public.delivery_queue dq
  JOIN public.orders o ON o.id = dq.order_id
  LEFT JOIN public.data_packages_config p ON p.id = o.package_id
  LEFT JOIN public.providers_config pr ON pr.id = o.provider_id
  WHERE dq.status = 'pending' AND dq.provider_name IS NULL
),
formatted AS (
  SELECT
    queue_id,
    provider_slug,
    o_receiver,
    -- normalize phone: ka saar 252 prefix, qaado 9 digits
    RIGHT(REGEXP_REPLACE(REGEXP_REPLACE(o_receiver, '^\+', ''), '\D', '', 'g'), 9) AS phone9,
    cost_price,
    -- Format amount: integer -> "10", decimal -> "0*10"
    CASE
      WHEN cost_price = FLOOR(cost_price) THEN FLOOR(cost_price)::text
      ELSE FLOOR(cost_price)::text || '*' || LPAD(ROUND((cost_price - FLOOR(cost_price)) * 100)::text, 2, '0')
    END AS amount_fmt,
    code_template,
    sim_password
  FROM ctx
  WHERE code_template IS NOT NULL
),
built AS (
  SELECT
    queue_id,
    provider_slug,
    o_receiver,
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(code_template, '{receiver_phone}', RIGHT(REGEXP_REPLACE(REGEXP_REPLACE(o_receiver, '^\+', ''), '\D', '', 'g'), 9)),
            '{cost_price}', amount_fmt
          ),
          '{selling_price}', amount_fmt
        ),
        '{amount}', amount_fmt
      ),
      '{sim_password}', sim_password
    ) AS new_ussd
  FROM formatted
)
UPDATE public.delivery_queue dq
SET 
  provider_name = b.provider_slug,
  receiver_phone = b.o_receiver,
  ussd_command = b.new_ussd,
  ussd_code = b.new_ussd,
  sim_slot = COALESCE(dq.sim_slot, 0)
FROM built b
WHERE dq.id = b.queue_id;