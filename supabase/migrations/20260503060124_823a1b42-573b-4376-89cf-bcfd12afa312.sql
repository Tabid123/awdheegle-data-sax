UPDATE public.delivery_instructions
SET code_template = REPLACE(REPLACE(code_template, '(receiver_phone}', '{receiver_phone}'), '{receiver_phone)', '{receiver_phone}')
WHERE code_template LIKE '%(receiver_phone}%' OR code_template LIKE '%{receiver_phone)%';