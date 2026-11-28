create function public.reward_admin_report(p_search text default '',p_offset integer default 0,p_phone text default null) returns jsonb
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
     select phone,count(*) as purchases,sum(points) as points,coalesce(sum(value) filter(where unit='USD'),0) as usd,coalesce(sum(value) filter(where unit='GB'),0) as gb
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
