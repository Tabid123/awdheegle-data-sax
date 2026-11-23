alter table public.offline_registrations
  add column preferred_category_id uuid,
  add column preferred_package_id uuid;
