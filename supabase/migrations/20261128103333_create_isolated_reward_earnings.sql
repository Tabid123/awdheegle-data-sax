create table if not exists public.reward_earnings (
  order_id uuid primary key,
  payment_source text not null check (length(btrim(payment_source)) between 1 and 100),
  payment_reference text not null check (length(btrim(payment_reference)) between 1 and 250),
  customer_phone text not null check (customer_phone ~ '^[0-9]{7,15}$'),
  package_id uuid not null,
  package_name text not null,
  points integer not null check (points between 1 and 1000000),
  earned_at timestamptz not null default now(),
  unique(payment_source,payment_reference)
);
alter table public.reward_earnings enable row level security;
revoke all on public.reward_earnings from public,anon,authenticated,service_role;
grant select on public.reward_earnings to authenticated;
grant select,insert on public.reward_earnings to service_role;
create policy reward_earnings_admin_read on public.reward_earnings for select to authenticated using ((select public.is_admin(auth.uid())));
create index if not exists reward_earnings_customer_idx on public.reward_earnings(customer_phone,earned_at desc);
comment on table public.reward_earnings is 'Append-only reward ledger. Only a trusted, independently authenticated payment and delivery flow may insert. No legacy order trigger.';
