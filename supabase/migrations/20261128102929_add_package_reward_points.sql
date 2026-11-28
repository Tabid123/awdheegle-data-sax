alter table public.data_packages_config add column if not exists reward_points integer not null default 0 check (reward_points between 0 and 1000000);
