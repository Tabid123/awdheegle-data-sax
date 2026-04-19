ALTER TABLE public.data_packages_config 
ADD COLUMN IF NOT EXISTS profit_margin numeric NOT NULL DEFAULT 15;