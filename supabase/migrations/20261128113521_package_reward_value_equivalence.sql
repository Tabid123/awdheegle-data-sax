alter table public.data_packages_config
 add column if not exists reward_value numeric(14,4) not null default 0 check(reward_value between 0 and 1000000),
 add column if not exists reward_value_unit text not null default 'USD' check(reward_value_unit in ('USD','GB'));
comment on column public.data_packages_config.reward_value is 'Display-only equivalent of all reward_points earned from one purchase of this package. Not an executable payout.';
comment on column public.data_packages_config.reward_value_unit is 'USD or GB; does not convert aggregate points across packages.';
