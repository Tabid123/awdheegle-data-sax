-- Manual rewards share the existing confirmed ledger and per-account transaction lock.
alter table public.reward_redemptions alter column package_id drop not null;
alter table public.reward_redemptions add column payout_kind text check(payout_kind in ('cash','internet')), add column payout_amount numeric(14,4) check(payout_amount>0), add column payout_reference text, add column deducted_usd numeric(14,4) not null default 0, add column deducted_gb numeric(14,4) not null default 0;
create unique index reward_manual_payout_reference on public.reward_redemptions(payout_reference) where payout_kind is not null;
alter table public.reward_earnings add column value_snapshot numeric(14,4) not null default 0, add column value_unit text not null default 'USD' check(value_unit in ('USD','GB'));
update public.reward_earnings e set value_snapshot=o.reward_value_snapshot,value_unit=o.reward_value_unit_snapshot from public.orders o where e.order_id=o.id;
create function reward_internal.capture_earning_value() returns trigger language plpgsql set search_path='' as $$
begin
 select o.reward_value_snapshot,o.reward_value_unit_snapshot into new.value_snapshot,new.value_unit from public.orders o where o.id=new.order_id;
 return new;
end; $$;
create trigger reward_earning_value_before_insert before insert on public.reward_earnings for each row execute function reward_internal.capture_earning_value();
create function reward_internal.confirm_manual_payout(p_phone text,p_request uuid,p_kind text,p_points integer,p_amount numeric,p_reference text,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin uuid:=auth.uid(); v_used bigint; v_earned bigint; v_usd numeric; v_gb numeric; v_existing public.reward_redemptions%rowtype; v_ref text:=btrim(coalesce(p_reference,'')); v_note text:=btrim(coalesce(p_note,''));
begin
 if v_admin is null or not public.is_admin(v_admin) then raise exception 'Admin permission required' using errcode='42501'; end if;
 if p_phone is null or p_phone !~ '^[0-9]{9}$' or p_request is null or p_kind is null or p_kind not in ('cash','internet') or p_points is null or p_points not between 1 and 1000000 or p_amount is null or p_amount<=0 or p_amount>9999999999 or round(p_amount,4)<>p_amount or length(v_ref) not between 3 and 200 or length(v_note) not between 5 and 500 then raise exception 'Invalid payout details'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,42161));
 select * into v_existing from public.reward_redemptions where id=p_request;
 if found then
   if v_existing.customer_phone<>p_phone or v_existing.payout_kind is distinct from p_kind or v_existing.points<>p_points or v_existing.payout_amount is distinct from p_amount or v_existing.payout_reference is distinct from v_ref then raise exception 'Request conflict'; end if;
   return jsonb_build_object('id',v_existing.id,'status',v_existing.status);
 end if;
 if exists(select 1 from public.reward_redemptions where customer_phone=p_phone and status='reserved') then raise exception 'Finish or cancel the existing reserved reward first'; end if;
 select coalesce(sum(points),0) into v_earned from public.reward_earnings where customer_phone=p_phone;
 select coalesce(sum(points),0) into v_used from public.reward_redemptions where customer_phone=p_phone and status='fulfilled';
 if v_earned-v_used<p_points then raise exception 'Insufficient confirmed points'; end if;
 with e as (select points,value_snapshot,value_unit,coalesce(sum(points) over(order by earned_at,order_id rows between unbounded preceding and 1 preceding),0) as prior from public.reward_earnings where customer_phone=p_phone),
 v as (select value_unit,round(value_snapshot*greatest(0,least(points,v_used+p_points-prior))/points,4)-round(value_snapshot*greatest(0,least(points,v_used-prior))/points,4) as amount from e)
 select coalesce(sum(amount) filter(where value_unit='USD'),0),coalesce(sum(amount) filter(where value_unit='GB'),0) into v_usd,v_gb from v;
 insert into public.reward_redemptions(id,customer_phone,package_id,package_name,points,status,created_by,verification_note,finished_by,finished_at,finish_note,payout_kind,payout_amount,payout_reference,deducted_usd,deducted_gb)
 values(p_request,p_phone,null,case when p_kind='cash' then 'Lacag' else 'Internet' end,p_points,'fulfilled',v_admin,v_note,v_admin,now(),v_note,p_kind,p_amount,v_ref,v_usd,v_gb);
 return jsonb_build_object('id',p_request,'status','fulfilled');
end; $$;
revoke all on function reward_internal.confirm_manual_payout(text,uuid,text,integer,numeric,text,text) from public,anon,authenticated;
grant execute on function reward_internal.confirm_manual_payout(text,uuid,text,integer,numeric,text,text) to authenticated;
create function public.reward_confirm_manual_payout(p_phone text,p_request uuid,p_kind text,p_points integer,p_amount numeric,p_reference text,p_note text) returns jsonb language sql security invoker set search_path='' as $$ select reward_internal.confirm_manual_payout(p_phone,p_request,p_kind,p_points,p_amount,p_reference,p_note); $$;
revoke all on function public.reward_confirm_manual_payout(text,uuid,text,integer,numeric,text,text) from public,anon,authenticated;
grant execute on function public.reward_confirm_manual_payout(text,uuid,text,integer,numeric,text,text) to authenticated;
-- Only aggregate deductions, matching the existing phone-based public reward preview.
-- Never expose payout reference, admin identity or payment history to anonymous clients.
create function reward_internal.paid_totals(p_phone text) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('points',coalesce(sum(points),0),'usd',coalesce(sum(deducted_usd),0),'gb',coalesce(sum(deducted_gb),0)) from public.reward_redemptions where customer_phone=p_phone and p_phone ~ '^[0-9]{9}$' and status='fulfilled'; $$;
revoke all on function reward_internal.paid_totals(text) from public,anon,authenticated;
grant usage on schema reward_internal to anon;
grant execute on function reward_internal.paid_totals(text) to anon,authenticated;
create function public.reward_paid_totals(p_phone text) returns jsonb language sql stable security invoker set search_path='' as $$ select reward_internal.paid_totals(p_phone); $$;
revoke all on function public.reward_paid_totals(text) from public,anon,authenticated;
grant execute on function public.reward_paid_totals(text) to anon,authenticated;
create or replace function public.reward_admin_report(p_search text default '',p_offset integer default 0,p_phone text default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; q text := regexp_replace(coalesce(p_search,''),'[^0-9]','','g');
begin
 if auth.uid() is null or not public.is_admin(auth.uid()) then raise exception 'Admin permission required' using errcode='42501'; end if;
 if p_phone is not null and p_phone !~ '^[0-9]{9}$' then raise exception 'Invalid account'; end if;
 if p_offset is null or p_offset<0 then raise exception 'Invalid page'; end if;
 if p_phone is not null then
   with purchases as (
     select distinct on (btrim(o.tx_id)) o.id,o.package_name,o.data_amount,o.amount,o.created_at,o.reward_points_snapshot as points,o.reward_value_snapshot as value,o.reward_value_unit_snapshot as unit
     from public.orders o
     where o.reward_account_phone=p_phone and o.status::text='completed' and o.delivery_status='delivered'
       and o.payment_source in ('ussd_online','sms_offline') and nullif(btrim(o.tx_id),'') is not null
     order by btrim(o.tx_id),o.created_at desc,o.id desc
   ), page as (select * from purchases order by created_at desc,id desc limit 50 offset p_offset)
   select jsonb_build_object('total',(select count(*) from purchases),'orders',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
 else
   if left(q,3)='252' and length(q)>9 then q:=substring(q from 4); end if;
   with purchases as (
     select distinct on (o.reward_account_phone,btrim(o.tx_id)) o.reward_account_phone as phone,o.reward_points_snapshot as points,o.reward_value_snapshot as value,o.reward_value_unit_snapshot as unit
     from public.orders o where o.reward_account_phone is not null and o.status::text='completed' and o.delivery_status='delivered'
       and o.payment_source in ('ussd_online','sms_offline') and nullif(btrim(o.tx_id),'') is not null and o.reward_points_snapshot>0
       and (q='' or o.reward_account_phone like '%'||q||'%')
     order by o.reward_account_phone,btrim(o.tx_id),o.created_at desc,o.id desc
   ), customers as (
     select phone,count(*) as purchases,greatest(0,sum(points)-coalesce((select sum(r.points) from public.reward_redemptions r where r.customer_phone=purchases.phone and r.status='fulfilled'),0)) as points,greatest(0,coalesce(sum(value) filter(where unit='USD'),0)-coalesce((select sum(r.deducted_usd) from public.reward_redemptions r where r.customer_phone=purchases.phone and r.status='fulfilled'),0)) as usd,greatest(0,coalesce(sum(value) filter(where unit='GB'),0)-coalesce((select sum(r.deducted_gb) from public.reward_redemptions r where r.customer_phone=purchases.phone and r.status='fulfilled'),0)) as gb
     from purchases group by phone
   ), page as (
     select c.*,coalesce((select sum(e.points) from public.reward_earnings e where e.customer_phone=c.phone),0) - coalesce((select sum(r.points) from public.reward_redemptions r where r.customer_phone=c.phone and r.status in ('reserved','fulfilled')),0) as available
     from customers c order by points desc,phone limit 50 offset p_offset
   )
   select jsonb_build_object('total',(select count(*) from customers),'points',coalesce((select sum(points) from customers),0),'usd',coalesce((select sum(usd) from customers),0),'gb',coalesce((select sum(gb) from customers),0),'customers',coalesce((select jsonb_agg(to_jsonb(page) order by points desc,phone) from page),'[]'::jsonb)) into result;
 end if;
 return result;
end; $$;
revoke all on function public.reward_admin_report(text,integer,text) from public,anon,authenticated;
grant execute on function public.reward_admin_report(text,integer,text) to authenticated;
