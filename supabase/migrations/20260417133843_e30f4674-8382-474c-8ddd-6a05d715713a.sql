
-- Fix 1: Add missing columns to delivery_instructions for ConfigViews "Add Code Cusub" form
ALTER TABLE public.delivery_instructions
  ADD COLUMN IF NOT EXISTS provider_id uuid,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS package_id uuid,
  ADD COLUMN IF NOT EXISTS code_template text,
  ADD COLUMN IF NOT EXISTS sim_password text,
  ADD COLUMN IF NOT EXISTS instruction_template text;

-- Make legacy NOT NULL columns optional so new inserts succeed
ALTER TABLE public.delivery_instructions ALTER COLUMN level DROP NOT NULL;
ALTER TABLE public.delivery_instructions ALTER COLUMN reference_id DROP NOT NULL;

-- Fix 2: Add provider_name to offline_registrations (OfflineMode.tsx inserts this) and unique constraint for upsert onConflict
ALTER TABLE public.offline_registrations
  ADD COLUMN IF NOT EXISTS provider_name text;

CREATE UNIQUE INDEX IF NOT EXISTS offline_registrations_sender_phone_key
  ON public.offline_registrations (sender_phone);
