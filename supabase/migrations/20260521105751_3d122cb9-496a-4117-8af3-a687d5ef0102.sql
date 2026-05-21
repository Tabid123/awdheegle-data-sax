ALTER TABLE public.banners_config 
  ADD COLUMN IF NOT EXISTS video_duration integer,
  ADD COLUMN IF NOT EXISTS rotation_interval integer;