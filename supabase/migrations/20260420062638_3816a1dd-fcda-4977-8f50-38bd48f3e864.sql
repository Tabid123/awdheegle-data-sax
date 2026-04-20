-- Convert secret_price from single numeric to numeric[] to support multiple secret prices per package
ALTER TABLE public.data_packages_config
  ALTER COLUMN secret_price TYPE numeric[]
  USING CASE
    WHEN secret_price IS NULL THEN NULL
    ELSE ARRAY[secret_price]
  END;