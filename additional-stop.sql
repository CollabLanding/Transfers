alter table public.transfers add column if not exists additional_stop text;
CREATE OR REPLACE FUNCTION transfers_private.enforce_transfer_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
 if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_by_name is distinct from old.created_by_name or new.move_number is distinct from old.move_number or new.created_at is distinct from old.created_at then raise exception 'Load identity and creator cannot be changed' using errcode='42501';end if;
 if (new.scheduled_date,new.scheduled_time,new.driver) is distinct from (old.scheduled_date,old.scheduled_time,old.driver) and not (transfers_private.has_any_permission(array['edit_load','move_load','summary_edit']) or (transfers_private.has_permission('resize_load') and new.scheduled_date=old.scheduled_date and new.driver=old.driver and new.duration_minutes is distinct from old.duration_minutes)) then raise exception 'Moving loads is not permitted' using errcode='42501';end if;
 if new.duration_minutes is distinct from old.duration_minutes and not transfers_private.has_any_permission(array['edit_load','resize_load','summary_edit']) then raise exception 'Resizing loads is not permitted' using errcode='42501';end if;
 if (new.origin,new.destination,new.additional_stop,new.dock_number,new.pallet_count,new.job_number,new.order_status) is distinct from (old.origin,old.destination,old.additional_stop,old.dock_number,old.pallet_count,old.job_number,old.order_status) and not transfers_private.has_any_permission(array['edit_load','summary_edit']) then raise exception 'Editing loads is not permitted' using errcode='42501';end if;
 if new.linked_next_id is distinct from old.linked_next_id and not transfers_private.has_permission('link_boxes') then raise exception 'Linking loads is not permitted' using errcode='42501';end if;
 if (new.urgent,new.pickup_by_date,new.pickup_by_time,new.deliver_by_date,new.deliver_by_time) is distinct from (old.urgent,old.pickup_by_date,old.pickup_by_time,old.deliver_by_date,old.deliver_by_time) and not transfers_private.has_permission('load_deadlines') then raise exception 'Urgency and deadline editing is not permitted' using errcode='42501';end if;
 else
 if not transfers_private.has_any_permission(array['create_load','duplicate_load','duplicate_day','restore_records']) then raise exception 'Creating loads is not permitted' using errcode='42501';end if;
 if (new.urgent or new.pickup_by_date is not null or new.pickup_by_time is not null or new.deliver_by_date is not null or new.deliver_by_time is not null) and not transfers_private.has_any_permission(array['load_deadlines','duplicate_load','duplicate_day','restore_records']) then raise exception 'Urgency and deadline access required' using errcode='42501';end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.log_transfer_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    v_details := concat_ws(' → ',old.origin,nullif(old.additional_stop,''),old.destination);
  elsif tg_op = 'INSERT' then
    v_row := new;
    v_action := 'Created';
    v_details := concat_ws(' → ',new.origin,nullif(new.additional_stop,''),new.destination);
  else
    v_row := new;

    if old.order_status is distinct from new.order_status then
      v_action := 'Status changed';
      v_details := coalesce(old.order_status,'') || ' → ' || coalesce(new.order_status,'');
    elsif old.urgent is distinct from new.urgent then
      v_action := case when new.urgent then 'Marked urgent' else 'Urgency removed' end;
      v_details := concat_ws(' → ',new.origin,nullif(new.additional_stop,''),new.destination);
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
       or old.additional_stop is distinct from new.additional_stop
       or old.pallet_count is distinct from new.pallet_count
       or old.job_number is distinct from new.job_number
       or old.pickup_by_date is distinct from new.pickup_by_date
       or old.pickup_by_time is distinct from new.pickup_by_time
       or old.deliver_by_date is distinct from new.deliver_by_date
       or old.deliver_by_time is distinct from new.deliver_by_time
       then
      v_action := 'Updated';
      v_details := concat_ws(' → ',new.origin,nullif(new.additional_stop,''),new.destination);
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
    move_number, job_number, driver, details
  )
  values(
    v_row.id, v_action, v_actor_id, v_actor_name,
    v_row.move_number, v_row.job_number, v_row.driver, v_details
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function visitor_private.read_visitor_board(p_token text,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_token is null or length(p_token)<>64 or not exists(select 1 from visitor_private.board_visitor_links where active and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then raise exception 'This visitor link is invalid or has been disabled.' using errcode='42501';end if;
 if p_date is null or p_date not between date '2020-01-01' and date '2100-12-31' then raise exception 'Choose a valid date';end if;
 return jsonb_build_object(
 'date',p_date,
 'drivers',(select coalesce(jsonb_agg(name order by sort_order nulls last,name),'[]') from public.transfer_drivers),
 'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by scheduled_time,move_number),'[]') from (
 select id,scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,additional_stop,pallet_count,job_number,order_status,move_number,urgent,dock_number,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time from public.transfers where scheduled_date=p_date)t),
 'schedules',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select driver_name,schedule_date,start_time,end_time from public.driver_schedules where schedule_date between p_date-1 and p_date)s),
 'statuses',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select id,scheduled_date,driver,start_minutes,end_minutes,status,custom_title,notes from public.transfer_slot_statuses where scheduled_date=p_date)s)
 );
end $$;

notify pgrst,'reload schema';