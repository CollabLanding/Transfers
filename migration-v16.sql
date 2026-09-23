-- Optional pickup/delivery deadline fields. Run before deploying the frontend.
alter table public.transfers
  add column if not exists pickup_by_date date,
  add column if not exists pickup_by_time time,
  add column if not exists deliver_by_date date,
  add column if not exists deliver_by_time time;

create or replace function public.log_transfer_activity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $activity$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_action text;
  v_details text;
  v_row public.transfers%rowtype;
begin
  v_actor_id := auth.uid();

  select display_name into v_actor_name
  from public.profiles
  where id = v_actor_id;

  if tg_op = 'DELETE' then
    v_row := old;
    v_action := 'Deleted';
    v_details := coalesce(old.origin,'') || ' → ' || coalesce(old.destination,'');
  elsif tg_op = 'INSERT' then
    v_row := new;
    v_action := 'Created';
    v_details := coalesce(new.origin,'') || ' → ' || coalesce(new.destination,'');
  else
    v_row := new;

    if old.order_status is distinct from new.order_status then
      v_action := 'Status changed';
      v_details := coalesce(old.order_status,'') || ' → ' || coalesce(new.order_status,'');
    elsif old.urgent is distinct from new.urgent then
      v_action := case when new.urgent then 'Marked urgent' else 'Urgency removed' end;
      v_details := coalesce(new.origin,'') || ' → ' || coalesce(new.destination,'');
    elsif old.driver is distinct from new.driver
       or old.scheduled_date is distinct from new.scheduled_date
       or old.scheduled_time is distinct from new.scheduled_time then
      v_action := 'Rescheduled';
      v_details := coalesce(new.scheduled_date::text,'') || ' ' ||
                   coalesce(left(new.scheduled_time::text,5),'') ||
                   case when old.driver is distinct from new.driver
                        then ' · Driver: ' || coalesce(new.driver,'')
                        else '' end;
    elsif old.duration_minutes is distinct from new.duration_minutes
       or old.origin is distinct from new.origin
       or old.destination is distinct from new.destination
       or old.pallet_count is distinct from new.pallet_count
       or old.job_number is distinct from new.job_number
       or old.pickup_by_date is distinct from new.pickup_by_date
       or old.pickup_by_time is distinct from new.pickup_by_time
       or old.deliver_by_date is distinct from new.deliver_by_date
       or old.deliver_by_time is distinct from new.deliver_by_time
       then
      v_action := 'Updated';
      v_details := coalesce(new.origin,'') || ' → ' || coalesce(new.destination,'');
    else
      return new;
    end if;
  end if;

  v_actor_name := coalesce(
    nullif(v_actor_name,''),
    nullif(v_row.created_by_name,''),
    'User'
  );

  insert into public.transfer_activity(
    transfer_id, action, actor_id, actor_name,
    job_number, driver, details
  )
  values(
    v_row.id, v_action, v_actor_id, v_actor_name,
    v_row.job_number, v_row.driver, v_details
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$activity$;

select pg_notify('pgrst', 'reload schema');
