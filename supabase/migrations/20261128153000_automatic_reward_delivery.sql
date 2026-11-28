-- Admin-only reward delivery; reserve first, queue atomically, deduct only after verified delivery.
alter table public.reward_redemptions add column delivery_order_id uuid unique;
create function reward_internal.queue_reward(p_phone text,p_request uuid,p_package uuid,p_points integer,p_order uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_admin uuid:=auth.uid(); v_pkg public.data_packages_config%rowtype; v_old public.reward_redemptions%rowtype;
 v_source public.orders%rowtype; v_provider text; v_template text; v_pin text; v_amount text; v_code text;
 v_parts text[]; v_dial text; v_cost numeric; v_earned bigint; v_used bigint; v_order_id uuid; v_slot int;
begin
 if v_admin is null or not public.is_admin(v_admin) then raise exception 'Admin permission required' using errcode='42501'; end if;
 if p_phone is null or p_phone !~ '^[0-9]{9}$' or p_request is null or p_package is null or p_points is null or p_points not between 1 and 1000000 then raise exception 'Invalid reward request'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,42161));
 select * into v_old from public.reward_redemptions where id=p_request;
 if found then
  if v_old.customer_phone<>p_phone or v_old.package_id is distinct from p_package or v_old.points<>p_points or v_old.delivery_order_id is null then raise exception 'Request conflict'; end if;
  return jsonb_build_object('id',v_old.id,'status',v_old.status);
 end if;
 if exists(select 1 from public.reward_redemptions where customer_phone=p_phone and status='reserved') then raise exception 'A reward is already pending; check its delivery first'; end if;
 if public.is_phone_blocked(p_phone) is distinct from false then raise exception 'Phone is blocked or cannot be verified'; end if;
 select * into v_pkg from public.data_packages_config where id=p_package and is_active and not is_discovery_root;
 if not found then raise exception 'Package not available'; end if;
 select lower(btrim(provider_name)) into v_provider from public.providers_config where id=v_pkg.provider_id and is_active;
 if v_provider is null or v_provider not in ('hormuud','somnet','somtel','amtel') then raise exception 'This provider requires a separate delivery route; automatic rewards not enabled'; end if;
 if exists(select 1 from public.package_delivery_rules where source_package_id=p_package) then raise exception 'Bundled package not supported for automatic reward delivery yet'; end if;
 if p_order is not null then
   select * into v_source from public.orders where id=p_order for share;
   if not found or v_source.reward_account_phone is distinct from p_phone or v_source.status::text<>'completed' or v_source.delivery_status is distinct from 'delivered' or v_source.payment_source not in ('ussd_online','sms_offline') or v_source.reward_points_snapshot<p_points or v_source.package_id is null or nullif(btrim(v_source.tx_id),'') is null then raise exception 'Original order not eligible'; end if;
   if exists(select 1 from public.reward_redemptions where payout_reference='reward-order:'||p_order::text) then raise exception 'Order reward already processed'; end if;
   perform reward_internal.admin_action('approve',p_phone,p_order,null,null,'Admin independently verified original payment and delivery.',v_source.tx_id);
 end if;
 select coalesce(sum(points),0) into v_earned from public.reward_earnings where customer_phone=p_phone;
 select coalesce(sum(points),0) into v_used from public.reward_redemptions where customer_phone=p_phone and status in ('reserved','fulfilled');
 if v_earned-v_used<p_points then raise exception 'Insufficient confirmed points'; end if;
 select code_template,sim_password into v_template,v_pin from public.delivery_instructions
 where provider_id=v_pkg.provider_id and nullif(btrim(code_template),'') is not null and (package_id=p_package or (package_id is null and (category_id=v_pkg.category_id or category_id is null)))
 order by case when package_id=p_package then 1 when category_id=v_pkg.category_id then 2 else 3 end,created_at desc limit 1;
 if v_template is null then raise exception 'Delivery instruction not configured'; end if;
 v_cost:=coalesce(v_pkg.cost_price,v_pkg.price);
 if v_cost is null or v_cost<=0 or round(v_cost,2)<>v_cost then raise exception 'Invalid package cost'; end if;
 v_amount:=case when trunc(v_cost)=v_cost then trunc(v_cost)::text when v_cost<1 then '0'||lpad((v_cost*100)::integer::text,2,'0') else trunc(v_cost)::text||'*'||lpad(((v_cost-trunc(v_cost))*100)::integer::text,2,'0') end;
 v_pin:=coalesce(nullif(btrim(v_pin),''),public.resolve_delivery_pin(p_package));
 if position('{sim_password}' in v_template)>0 and coalesce(v_pin,'') !~ '^[0-9]{3,12}$' then raise exception 'Delivery PIN not configured'; end if;
 if position('{receiver_phone}' in v_template)=0 then raise exception 'Delivery template must contain receiver phone'; end if;
 v_code:=replace(replace(replace(replace(replace(v_template,'{receiver_phone}',p_phone),'{cost_price}',v_amount),'{selling_price}',v_amount),'{amount}',v_amount),'{sim_password}',coalesce(v_pin,''));
 if v_code ~ '[{}]' then raise exception 'Unsupported delivery template placeholder'; end if;
 v_parts:=string_to_array(v_code,'|'); v_dial:=regexp_replace(v_parts[1],'[[:space:]]+','','g'); v_dial:=regexp_replace(v_dial,'[*]{2,}','*','g');
 if right(v_dial,1)<>'#' then v_dial:=v_dial||'#'; end if;
 if v_dial !~ '^\*[0-9*]+#$' then raise exception 'Invalid configured USSD dial'; end if;
 v_code:=v_dial||case when cardinality(v_parts)>1 then '|'||array_to_string(v_parts[2:cardinality(v_parts)],'|') else '' end;
 select case when lower(coalesce(nullif(d.sim1_provider,''),d.provider_name,''))=v_provider and d.sim1_delivery_enabled then 0 else 1 end into v_slot
 from public.android_devices d where d.is_active and d.archived_at is null and ((lower(coalesce(nullif(d.sim1_provider,''),d.provider_name,''))=v_provider and d.sim1_delivery_enabled) or (lower(coalesce(d.sim2_provider,''))=v_provider and d.sim2_delivery_enabled)) order by d.last_heartbeat desc nulls last limit 1;
 if not found then raise exception 'No enabled delivery SIM for this provider'; end if;
 insert into public.orders(provider_id,package_id,sender_phone,receiver_phone,amount,selling_price,cost_price,package_name,data_amount,status,payment_status,delivery_status,payment_source,is_manual,is_offline,delivery_notes)
 values(v_pkg.provider_id,p_package,'252'||p_phone,'252'||p_phone,0,0,v_cost,v_pkg.package_name,v_pkg.data_amount,'processing','matched','queued','reward',true,false,'Reward delivery - no customer payment') returning id into v_order_id;
 insert into public.reward_redemptions(id,customer_phone,package_id,package_name,points,status,created_by,verification_note,payout_kind,payout_amount,payout_reference,delivery_order_id)
 values(p_request,p_phone,p_package,v_pkg.package_name||coalesce(' - '||v_pkg.data_amount,''),p_points,'reserved',v_admin,'Admin requested automatic reward delivery','internet',coalesce(v_pkg.selling_price,v_pkg.price),case when p_order is not null then 'reward-order:'||p_order::text else 'reward-payout:'||p_request::text end,v_order_id);
 insert into public.delivery_queue(order_id,package_id,execution_order,delay_seconds,status,ussd_command,ussd_code,provider_name,receiver_phone,sim_slot)
 values(v_order_id,p_package,1,0,'pending',v_code,v_code,v_provider,p_phone,v_slot);
 return jsonb_build_object('id',p_request,'status','reserved');
end; $$;
revoke all on function reward_internal.queue_reward(text,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function reward_internal.queue_reward(text,uuid,uuid,integer,uuid) to authenticated;
create function public.reward_queue_delivery(p_phone text,p_request uuid,p_package uuid,p_points integer,p_order uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select reward_internal.queue_reward(p_phone,p_request,p_package,p_points,p_order); $$;
revoke all on function public.reward_queue_delivery(text,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.reward_queue_delivery(text,uuid,uuid,integer,uuid) to authenticated;
create function reward_internal.finish_reward_delivery(p_phone text,p_request uuid,p_delivered boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_admin uuid:=auth.uid(); v_r public.reward_redemptions%rowtype; v_used bigint; v_usd numeric; v_gb numeric;
begin
 if v_admin is null or not public.is_admin(v_admin) then raise exception 'Admin permission required' using errcode='42501'; end if;
 if p_phone is null or p_phone !~ '^[0-9]{9}$' or p_request is null or p_delivered is null then raise exception 'Invalid request'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,42161));
 select * into v_r from public.reward_redemptions where id=p_request and customer_phone=p_phone and delivery_order_id is not null for update;
 if not found then raise exception 'Reward delivery not found'; end if;
 if v_r.status<>'reserved' then
   if v_r.status=case when p_delivered then 'fulfilled' else 'cancelled' end then return jsonb_build_object('status',v_r.status); end if;
   raise exception 'Reward already finalized';
 end if;
 if p_delivered then
  if not exists(select 1 from public.delivery_queue where order_id=v_r.delivery_order_id and status='completed') or exists(select 1 from public.delivery_queue where order_id=v_r.delivery_order_id and status<>'completed') then raise exception 'Delivery has not completed; check the device first'; end if;
  if not exists(select 1 from public.orders where id=v_r.delivery_order_id and delivery_status='delivered' and status::text='completed') then raise exception 'Order has not been confirmed delivered'; end if;
  select coalesce(sum(points),0) into v_used from public.reward_redemptions where customer_phone=p_phone and status='fulfilled';
  with e as (select points,value_snapshot,value_unit,coalesce(sum(points) over(order by earned_at,order_id rows between unbounded preceding and 1 preceding),0) as prior from public.reward_earnings where customer_phone=p_phone),
  v as (select value_unit,round(value_snapshot*greatest(0,least(points,v_used+v_r.points-prior))/points,4)-round(value_snapshot*greatest(0,least(points,v_used-prior))/points,4) as amount from e)
  select coalesce(sum(amount) filter(where value_unit='USD'),0),coalesce(sum(amount) filter(where value_unit='GB'),0) into v_usd,v_gb from v;
  update public.reward_redemptions set status='fulfilled',finished_by=v_admin,finished_at=now(),finish_note='Admin independently confirmed automatic package delivery: '||v_r.package_name,deducted_usd=v_usd,deducted_gb=v_gb where id=p_request;
 else
  if not exists(select 1 from public.delivery_queue where order_id=v_r.delivery_order_id) or exists(select 1 from public.delivery_queue where order_id=v_r.delivery_order_id and (status not in ('failed','cancelled') or dispatched_at is not null or ussd_dispatched)) then raise exception 'Delivery may have occurred; resolve device evidence before releasing points'; end if;
  update public.reward_redemptions set status='cancelled',finished_by=v_admin,finished_at=now(),finish_note='Admin confirmed failed undelivered reward',payout_reference=null where id=p_request;
 end if;
 return jsonb_build_object('status',case when p_delivered then 'fulfilled' else 'cancelled' end);
end; $$;
revoke all on function reward_internal.finish_reward_delivery(text,uuid,boolean) from public,anon,authenticated;
grant execute on function reward_internal.finish_reward_delivery(text,uuid,boolean) to authenticated;
create function public.reward_finish_delivery(p_phone text,p_request uuid,p_delivered boolean) returns jsonb language sql security invoker set search_path='' as $$ select reward_internal.finish_reward_delivery(p_phone,p_request,p_delivered); $$;
revoke all on function public.reward_finish_delivery(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reward_finish_delivery(text,uuid,boolean) to authenticated;
-- Prevent the old generic admin flow from bypassing the new delivery-specific checks.
create or replace function public.reward_admin_action(p_action text,p_phone text,p_order uuid default null,p_package uuid default null,p_request uuid default null,p_note text default null,p_reference text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_action in ('fulfill','cancel') and exists(select 1 from public.reward_redemptions where id=p_request and delivery_order_id is not null) then raise exception 'Use reward delivery confirmation'; end if;
 return reward_internal.admin_action(p_action,p_phone,p_order,p_package,p_request,p_note,p_reference);
end; $$;
