alter table public.orders add column if not exists reward_account_phone text check (reward_account_phone ~ '^[0-9]{9}$'), add column if not exists reward_points_snapshot integer not null default 0 check (reward_points_snapshot between 0 and 1000000);
alter table public.offline_registrations add column if not exists reward_account_phone text check (reward_account_phone ~ '^[0-9]{9}$');
create or replace function private.snapshot_order_reward() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   new.reward_account_phone := old.reward_account_phone;
   new.reward_points_snapshot := old.reward_points_snapshot;
 else
   new.reward_points_snapshot := 0;
   if new.reward_account_phone is not null and new.package_id is not null then
     select coalesce(p.reward_points,0) into new.reward_points_snapshot from public.data_packages_config p where p.id=new.package_id;
     new.reward_points_snapshot := coalesce(new.reward_points_snapshot,0);
   end if;
 end if;
 return new;
end; $$;
revoke all on function private.snapshot_order_reward() from public,anon,authenticated;
create trigger reward_snapshot_before_order before insert or update on public.orders for each row execute function private.snapshot_order_reward();
comment on column public.orders.reward_account_phone is 'Explicit app login phone; never substitute payer or receiver. Untrusted until independently verified.';
comment on column public.orders.reward_points_snapshot is 'Potential points captured at order creation; not awarded or redeemable.';
