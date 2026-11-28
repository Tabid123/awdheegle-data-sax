alter table public.reward_earnings add column if not exists approved_by uuid, add column if not exists approval_note text;
create unique index if not exists reward_earnings_unique_reference on public.reward_earnings(payment_reference);
create table public.reward_redemptions (
 id uuid primary key,
 customer_phone text not null check(customer_phone ~ '^[0-9]{9}$'),
 package_id uuid not null,
 package_name text not null,
 points integer not null check(points between 1 and 1000000),
 status text not null default 'reserved' check(status in ('reserved','fulfilled','cancelled')),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 verification_note text not null check(length(btrim(verification_note)) between 5 and 500),
 finished_by uuid,
 finished_at timestamptz,
 finish_note text
);
alter table public.reward_redemptions enable row level security;
revoke all on public.reward_redemptions from public,anon,authenticated,service_role;
grant select on public.reward_redemptions to authenticated;
create policy reward_redemptions_admin_read on public.reward_redemptions for select to authenticated using ((select public.is_admin(auth.uid())));
create index reward_redemptions_customer_idx on public.reward_redemptions(customer_phone,created_at desc);
create schema if not exists reward_internal;
revoke all on schema reward_internal from public,anon,authenticated;
grant usage on schema reward_internal to authenticated;
create function reward_internal.admin_action(p_action text,p_phone text,p_order uuid,p_package uuid,p_request uuid,p_note text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_admin uuid := auth.uid();
 v_order public.orders%rowtype;
 v_package public.data_packages_config%rowtype;
 v_redemption public.reward_redemptions%rowtype;
 v_earned bigint; v_used bigint;
 v_note text := btrim(coalesce(p_note,''));
begin
 if v_admin is null or not public.is_admin(v_admin) then raise exception 'Admin permission required' using errcode='42501'; end if;
 if p_phone is null or p_phone !~ '^[0-9]{9}$' then raise exception 'Invalid login phone'; end if;
 if p_action not in ('summary','approve','reserve','fulfill','cancel') then raise exception 'Invalid action'; end if;
 if p_action <> 'summary' and length(v_note) not between 5 and 500 then raise exception 'Verification note required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,42161));
 if p_action='approve' then
   select * into v_order from public.orders where id=p_order for share;
   if not found or v_order.reward_account_phone is distinct from p_phone or v_order.status::text<>'completed' or v_order.delivery_status is distinct from 'delivered' or v_order.payment_source is null or v_order.payment_source not in ('ussd_online','sms_offline') or v_order.reward_points_snapshot<=0 or v_order.package_id is null or nullif(btrim(v_order.tx_id),'') is null then raise exception 'Order not eligible'; end if;
   if nullif(btrim(p_reference),'') is distinct from btrim(v_order.tx_id) then raise exception 'Verified payment reference does not match'; end if;
   insert into public.reward_earnings(order_id,payment_source,payment_reference,customer_phone,package_id,package_name,points,approved_by,approval_note)
   values(v_order.id,v_order.payment_source,btrim(v_order.tx_id),p_phone,v_order.package_id,coalesce(v_order.package_name,'Data package'),v_order.reward_points_snapshot,v_admin,v_note)
   on conflict do nothing;
 elsif p_action='reserve' then
   if p_request is null or p_package is null then raise exception 'Missing redemption request'; end if;
   select * into v_redemption from public.reward_redemptions where id=p_request;
   if found then
     if v_redemption.customer_phone<>p_phone or v_redemption.package_id<>p_package then raise exception 'Request conflict'; end if;
   else
     select * into v_package from public.data_packages_config where id=p_package and is_active and not is_discovery_root and redemption_points>0 for share;
     if not found then raise exception 'Reward unavailable'; end if;
     select coalesce(sum(points),0) into v_earned from public.reward_earnings where customer_phone=p_phone;
     select coalesce(sum(points),0) into v_used from public.reward_redemptions where customer_phone=p_phone and status in ('reserved','fulfilled');
     if v_earned-v_used<v_package.redemption_points then raise exception 'Insufficient confirmed points'; end if;
     insert into public.reward_redemptions(id,customer_phone,package_id,package_name,points,created_by,verification_note)
     values(p_request,p_phone,p_package,v_package.package_name,v_package.redemption_points,v_admin,v_note);
   end if;
 elsif p_action in ('fulfill','cancel') then
   select * into v_redemption from public.reward_redemptions where id=p_request and customer_phone=p_phone for update;
   if not found then raise exception 'Redemption not found'; end if;
   if v_redemption.status='reserved' then
     update public.reward_redemptions set status=case when p_action='fulfill' then 'fulfilled' else 'cancelled' end,finished_by=v_admin,finished_at=now(),finish_note=v_note where id=p_request;
   elsif (p_action='fulfill' and v_redemption.status<>'fulfilled') or (p_action='cancel' and v_redemption.status<>'cancelled') then raise exception 'Redemption already finalized'; end if;
 end if;
 select coalesce(sum(points),0) into v_earned from public.reward_earnings where customer_phone=p_phone;
 select coalesce(sum(points),0) into v_used from public.reward_redemptions where customer_phone=p_phone and status in ('reserved','fulfilled');
 return jsonb_build_object('earned',v_earned,'used',v_used,'available',v_earned-v_used,
 'candidates',coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id,o.package_name,o.reward_points_snapshot as points,o.created_at,o.tx_id,o.amount,o.sender_phone,o.receiver_phone from public.orders o where o.reward_account_phone=p_phone and o.status::text='completed' and o.delivery_status='delivered' and o.payment_source in ('ussd_online','sms_offline') and o.reward_points_snapshot>0 and o.package_id is not null and nullif(btrim(o.tx_id),'') is not null and not exists(select 1 from public.reward_earnings e where e.order_id=o.id or e.payment_reference=btrim(o.tx_id)) order by o.created_at desc limit 50)x),'[]'::jsonb),
 'redemptions',coalesce((select jsonb_agg(to_jsonb(y)) from (select id,package_name,points,status,created_at from public.reward_redemptions where customer_phone=p_phone order by (status='reserved') desc,created_at desc limit 100)y),'[]'::jsonb));
end; $$;
revoke all on function reward_internal.admin_action(text,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function reward_internal.admin_action(text,text,uuid,uuid,uuid,text,text) to authenticated;
create function public.reward_admin_action(p_action text,p_phone text,p_order uuid default null,p_package uuid default null,p_request uuid default null,p_note text default null,p_reference text default null) returns jsonb
language sql security invoker set search_path='' as $$ select reward_internal.admin_action(p_action,p_phone,p_order,p_package,p_request,p_note,p_reference); $$;
revoke all on function public.reward_admin_action(text,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reward_admin_action(text,text,uuid,uuid,uuid,text,text) to authenticated;
create index if not exists orders_reward_account_idx on public.orders(reward_account_phone,created_at desc) where reward_account_phone is not null and reward_points_snapshot>0;
