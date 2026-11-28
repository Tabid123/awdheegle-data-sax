alter table public.orders add column if not exists reward_value_snapshot numeric(14,4) not null default 0 check(reward_value_snapshot between 0 and 1000000), add column if not exists reward_value_unit_snapshot text not null default 'USD' check(reward_value_unit_snapshot in ('USD','GB'));
create or replace function private.snapshot_order_reward() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   new.reward_account_phone := old.reward_account_phone;
   new.reward_points_snapshot := old.reward_points_snapshot;
   new.reward_value_snapshot := old.reward_value_snapshot;
   new.reward_value_unit_snapshot := old.reward_value_unit_snapshot;
 else
   new.reward_points_snapshot := 0;
   new.reward_value_snapshot := 0;
   new.reward_value_unit_snapshot := 'USD';
   if new.reward_account_phone is not null and new.package_id is not null then
     select p.reward_points, case when p.reward_points>0 then p.reward_value else 0 end, p.reward_value_unit
       into new.reward_points_snapshot,new.reward_value_snapshot,new.reward_value_unit_snapshot
       from public.data_packages_config p where p.id=new.package_id;
     new.reward_points_snapshot := coalesce(new.reward_points_snapshot,0);
     new.reward_value_snapshot := coalesce(new.reward_value_snapshot,0);
     new.reward_value_unit_snapshot := coalesce(new.reward_value_unit_snapshot,'USD');
   end if;
 end if;
 return new;
end; $$;
revoke all on function private.snapshot_order_reward() from public,anon,authenticated;
comment on column public.orders.reward_value_snapshot is 'Non-spendable equivalent captured when order is created; never use for automatic payment.';
