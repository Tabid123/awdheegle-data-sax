CREATE OR REPLACE FUNCTION reward_internal.settle_delivered_reward(p_order uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_r public.reward_redemptions%rowtype; v_used bigint; v_usd numeric; v_gb numeric;
begin
 select * into v_r from public.reward_redemptions where delivery_order_id=p_order and status='reserved';
 if not found then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_r.customer_phone,42161));
 select * into v_r from public.reward_redemptions where delivery_order_id=p_order and status='reserved' for update;
 if not found then return false; end if;
 if not exists(select 1 from public.orders where id=p_order and status::text='completed' and delivery_status='delivered') then return false; end if;
 if not exists(select 1 from public.delivery_queue where order_id=p_order) or exists(select 1 from public.delivery_queue where order_id=p_order and (status is distinct from 'completed' or completed_at is null or dispatched_at is null or not ussd_dispatched or claimed_by is null or nullif(btrim(provider_response),'') is null)) then return false; end if;
 select coalesce(sum(points),0) into v_used from public.reward_redemptions where customer_phone=v_r.customer_phone and status='fulfilled';
 with e as (select points,value_snapshot,value_unit,coalesce(sum(points) over(order by earned_at,order_id rows between unbounded preceding and 1 preceding),0) as prior from public.reward_earnings where customer_phone=v_r.customer_phone),
 v as (select value_unit,round(value_snapshot*greatest(0,least(points,v_used+v_r.points-prior))/points,4)-round(value_snapshot*greatest(0,least(points,v_used-prior))/points,4) as amount from e)
 select coalesce(sum(amount) filter(where value_unit='USD'),0),coalesce(sum(amount) filter(where value_unit='GB'),0) into v_usd,v_gb from v;
 update public.reward_redemptions set status='fulfilled',finished_by=null,finished_at=now(),finish_note='Automatically confirmed delivery: '||v_r.package_name,deducted_usd=v_usd,deducted_gb=v_gb where id=v_r.id;
 return true;
end; $function$
;
revoke all on function reward_internal.settle_delivered_reward(uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION reward_internal.on_reward_order_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 -- Only the server-side delivery worker's service-role write may auto-settle.
 if current_setting('role',true)='service_role' and new.status::text='completed' and new.delivery_status='delivered' and (old.status is distinct from new.status or old.delivery_status is distinct from new.delivery_status) then
   begin
     perform reward_internal.settle_delivered_reward(new.id);
   exception when others then
     raise warning 'Reward settlement failed for order %: %',new.id,sqlstate;
   end;
 end if;
 return new;
end; $function$
;
revoke all on function reward_internal.on_reward_order_delivered() from public,anon,authenticated;
CREATE TRIGGER reward_auto_settle_after_delivery AFTER UPDATE OF status, delivery_status ON public.orders FOR EACH ROW WHEN (((new.status = 'completed'::order_status) AND (new.delivery_status = 'delivered'::text))) EXECUTE FUNCTION reward_internal.on_reward_order_delivered();
