alter table public.data_packages_config add column if not exists redemption_points integer not null default 0 check (redemption_points between 0 and 1000000);
comment on column public.data_packages_config.redemption_points is 'Points required to redeem this package; zero means disabled. Catalog configuration only; no automatic redemption.';
