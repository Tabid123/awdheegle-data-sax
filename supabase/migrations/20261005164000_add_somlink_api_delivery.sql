-- Somlink API delivery support for Awdheegle Data.
-- Credentials are stored as Supabase project secrets, not in source control.

alter table public.data_packages_config
  add column if not exists somlink_bundle_id integer;

alter table public.delivery_queue
  add column if not exists somlink_response jsonb;

create index if not exists idx_data_packages_somlink_bundle
  on public.data_packages_config(somlink_bundle_id)
  where somlink_bundle_id is not null;

create or replace function public.enqueue_somlink_delivery(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_provider_name text;
  v_bundle_id integer;
  v_cost numeric;
  v_queue_id uuid;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then raise exception 'order_not_found'; end if;

  select lower(pr.provider_name), p.somlink_bundle_id, p.cost_price
    into v_provider_name, v_bundle_id, v_cost
  from public.data_packages_config p
  join public.providers_config pr on pr.id=p.provider_id
  where p.id=v_order.package_id;

  if v_provider_name <> 'somlink' then raise exception 'not_somlink_order'; end if;
  if coalesce(v_bundle_id,0) <= 0 or coalesce(v_cost,0) <= 0 then
    raise exception 'somlink_package_not_configured';
  end if;

  select id into v_queue_id
  from public.delivery_queue
  where order_id=p_order_id
    and lower(coalesce(provider_name,''))='somlink'
    and status in ('pending','processing','completed')
  order by created_at desc
  limit 1;

  if v_queue_id is not null then return v_queue_id; end if;

  insert into public.delivery_queue(
    order_id, package_id, provider_name, receiver_phone,
    status, execution_order, ussd_command, ussd_code,
    package_code, pin_code, android_device_id, claimed_by, sim_slot
  ) values (
    p_order_id, v_order.package_id, 'somlink', v_order.receiver_phone,
    'pending', 0, null, null,
    v_bundle_id::text, null, null, null, null
  )
  returning id into v_queue_id;

  update public.orders set delivery_status='queued' where id=p_order_id;
  return v_queue_id;
end;
$$;

revoke all on function public.enqueue_somlink_delivery(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_somlink_delivery(uuid) to service_role;

create or replace function public.claim_next_delivery(p_device_id uuid, p_providers text[] default null)
returns table(
  id uuid, order_id uuid, ussd_command text, ussd_code text, package_id uuid,
  provider_name text, receiver_phone text, sim_slot integer, attempts integer,
  package_code text, pin_code text, queue_id uuid,
  discovery_menu_index integer, discovery_menu_label text
)
language plpgsql
security definer
set search_path=public
as $$
declare v_queue_id uuid;
begin
  if p_providers is null or array_length(p_providers,1) is null then return; end if;

  select dq.id into v_queue_id
  from public.delivery_queue dq
  where dq.status='pending'
    and lower(coalesce(dq.provider_name,'')) <> 'somlink'
    and exists (
      select 1 from public.android_devices device
      where device.id=p_device_id
        and device.is_active and device.archived_at is null
        and case
          when lower(coalesce(nullif(device.sim1_provider,''),device.provider_name,''))=lower(dq.provider_name)
            then device.sim1_delivery_enabled
          when lower(coalesce(device.sim2_provider,''))=lower(dq.provider_name)
            then device.sim2_delivery_enabled
          else false end
    )
    and dq.dispatched_at is null
    and coalesce(dq.attempts,0) < 3
    and (dq.scheduled_at is null or dq.scheduled_at <= now())
    and dq.provider_name is not null
    and dq.discovery_session_id is null
    and lower(dq.provider_name) in (select lower(x) from unnest(p_providers) as x)
    and not exists (
      select 1 from public.android_devices ad
      where ad.is_active and ad.archived_at is null
        and case
          when lower(coalesce(nullif(ad.sim1_provider,''),ad.provider_name,''))=lower(dq.provider_name)
            then ad.sim1_delivery_enabled
          when lower(coalesce(ad.sim2_provider,''))=lower(dq.provider_name)
            then ad.sim2_delivery_enabled
          else false end
        and ad.primary_for_provider is not null
        and lower(ad.primary_for_provider)=lower(dq.provider_name)
        and ad.id <> p_device_id
        and ad.last_heartbeat > now() - interval '90 seconds'
    )
  order by dq.created_at asc
  for update skip locked
  limit 1;

  if v_queue_id is null then return; end if;

  update public.delivery_queue dq
  set status='processing', claimed_by=p_device_id, android_device_id=p_device_id,
      claimed_at=now(), last_attempt_at=now(), attempts=coalesce(dq.attempts,0)+1
  where dq.id=v_queue_id;

  return query
  select dq.id,dq.order_id,dq.ussd_command,coalesce(dq.ussd_code,dq.ussd_command),dq.package_id,
    coalesce(dq.provider_name,(
      select lower(pr.provider_name)
      from public.providers_config pr
      join public.data_packages_config p on p.provider_id=pr.id
      where p.id=dq.package_id
    )),
    coalesce(dq.receiver_phone,(select o.receiver_phone from public.orders o where o.id=dq.order_id)),
    (
      select case when lower(coalesce(nullif(device.sim1_provider,''),device.provider_name,''))=lower(dq.provider_name)
                  then 0 else 1 end
      from public.android_devices device where device.id=p_device_id
    ),
    coalesce(dq.attempts,1),dq.package_code,dq.pin_code,dq.id,
    dq.discovery_menu_index,dq.discovery_menu_label
  from public.delivery_queue dq
  where dq.id=v_queue_id;
end;
$$;
