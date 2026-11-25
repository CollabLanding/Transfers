begin;

alter table transfers_private.user_access
  drop constraint user_access_role_check,
  add constraint user_access_role_check check (role in ('Owner','Admin','User','Vendor','Driver')),
  add column driver_slot text references public.transfer_drivers(name) on update cascade on delete set null;
create unique index user_access_driver_slot_idx on transfers_private.user_access(driver_slot)
  where role='Driver';

-- These older tables predate the Transfers permission grid.
create policy "Driver accounts cannot access downtime"
  on public.driver_downtime as restrictive for all to authenticated
  using ((select transfers_private.current_access_role()) <> 'Driver')
  with check ((select transfers_private.current_access_role()) <> 'Driver');
create policy "Driver accounts cannot access invoice marks"
  on public.driver_invoice_marks as restrictive for all to authenticated
  using ((select transfers_private.current_access_role()) <> 'Driver')
  with check ((select transfers_private.current_access_role()) <> 'Driver');

create function transfers_private.driver_account_options() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not transfers_private.access_is_admin() or not transfers_private.has_permission('manage_users') then
    raise exception 'User Access permission required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'slots', (select coalesce(jsonb_agg(name order by sort_order,name),'[]') from public.transfer_drivers where name <> 'Planning' and is_active),
    'assignments', (select coalesce(jsonb_object_agg(user_id,driver_slot),'{}') from transfers_private.user_access where role='Driver')
  );
end $$;

create function transfers_private.assign_driver_account(p_user_id uuid,p_driver_slot text) returns void
language plpgsql security definer set search_path='' as $$
declare old_role text;
begin
  if not transfers_private.access_is_admin() or not transfers_private.has_permission('manage_users') then
    raise exception 'User Access permission required' using errcode='42501';
  end if;
  select role into old_role from transfers_private.user_access where user_id=p_user_id for update;
  if old_role is null or old_role='Owner' or p_user_id=auth.uid() then
    raise exception 'This account cannot be assigned to a driver column' using errcode='42501';
  end if;
  if not exists (select 1 from public.transfer_drivers where name=p_driver_slot and name<>'Planning' and is_active) then
    raise exception 'Choose an active driver column';
  end if;
  update transfers_private.user_access set role='Driver',driver_slot=p_driver_slot,updated_by=auth.uid(),updated_at=now()
  where user_id=p_user_id;
exception when unique_violation then
  raise exception 'That driver column already has a login';
end $$;

create function transfers_private.driver_dispatches() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  slot text;
  board_date date := (now() at time zone 'America/Chicago')::date;
begin
  select a.driver_slot into slot from transfers_private.user_access a
  where a.user_id=auth.uid() and a.role='Driver';
  if not found then raise exception 'Driver account required' using errcode='42501'; end if;
  return jsonb_build_object('driver',slot,'date',board_date,'jobs',(
    select coalesce(jsonb_agg(
      jsonb_build_object('id',id,'move_number',move_number,'time',scheduled_time,'status',order_status,
        'origin',origin,'origin_dock',dock_number,'stop1',additional_stop,'stop2',additional_stop_2,
        'destination',destination,'destination_dock',destination_dock_number,'pallets',pallet_count,
        'notes',job_number,'urgent',urgent)
      order by scheduled_time,move_number,id),'[]')
    from public.transfers where driver=slot and scheduled_date=board_date
  ));
end $$;

create function transfers_private.driver_update_dispatch(p_id uuid,p_status text,p_expected_status text,p_message text)
returns void language plpgsql security definer set search_path='' as $$
declare
  slot text;
  job public.transfers%rowtype;
  stages constant text[] := array['Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered'];
begin
  -- Hold the account assignment through the write, then lock the load before using its assignment or status.
  select a.driver_slot into slot from transfers_private.user_access a
  where a.user_id=auth.uid() and a.role='Driver' for share;
  if slot is null then raise exception 'Driver column required' using errcode='42501'; end if;

  select * into job from public.transfers where id=p_id and driver=slot
    and scheduled_date=(now() at time zone 'America/Chicago')::date for update;
  if not found then raise exception 'This dispatch is no longer assigned to you today' using errcode='42501'; end if;

  if p_message is not null then
    if p_status is not null or char_length(btrim(p_message)) not between 1 and 400 then
      raise exception 'Enter a message between 1 and 400 characters';
    end if;
    insert into public.transfer_chat_messages(user_id,user_name,message)
    values(auth.uid(),slot,'Move #'||coalesce(job.move_number::text,'—')||' · '||btrim(p_message));
    return;
  end if;

  if p_status not in ('Waiting','Loaded','In Transit','On Site','Delivered') or p_status is null then
    raise exception 'Choose a driver status';
  end if;
  if job.order_status=p_status then return; end if;
  if job.order_status is distinct from p_expected_status then
    raise exception 'Dispatch changed the status. Review the latest status and try again.';
  end if;
  if array_position(stages,job.order_status) is null
      or array_position(stages,p_status)<=array_position(stages,job.order_status) then
    raise exception 'Ask dispatch to correct the current status';
  end if;

  update public.transfers set order_status=p_status,updated_at=now() where id=job.id;
end $$;

create function public.get_driver_account_options() returns jsonb
language sql stable security invoker set search_path='' as $$ select transfers_private.driver_account_options() $$;
create function public.assign_transfer_driver_account(p_user_id uuid,p_driver_slot text) returns void
language sql security invoker set search_path='' as $$ select transfers_private.assign_driver_account(p_user_id,p_driver_slot) $$;
create function public.get_my_driver_dispatches() returns jsonb
language sql stable security invoker set search_path='' as $$ select transfers_private.driver_dispatches() $$;
create function public.update_my_driver_dispatch(p_id uuid,p_status text,p_expected_status text,p_message text) returns void
language sql security invoker set search_path='' as $$ select transfers_private.driver_update_dispatch(p_id,p_status,p_expected_status,p_message) $$;

revoke all on function transfers_private.driver_account_options(),transfers_private.assign_driver_account(uuid,text),
  transfers_private.driver_dispatches(),transfers_private.driver_update_dispatch(uuid,text,text,text),
  public.get_driver_account_options(),public.assign_transfer_driver_account(uuid,text),
  public.get_my_driver_dispatches(),public.update_my_driver_dispatch(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function transfers_private.driver_account_options(),transfers_private.assign_driver_account(uuid,text),
  transfers_private.driver_dispatches(),transfers_private.driver_update_dispatch(uuid,text,text,text),
  public.get_driver_account_options(),public.assign_transfer_driver_account(uuid,text),
  public.get_my_driver_dispatches(),public.update_my_driver_dispatch(uuid,text,text,text)
  to authenticated;

CREATE OR REPLACE FUNCTION transfers_private.enforce_transfer_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
   -- The driver RPC runs as the table owner and has already locked and checked the assignment.
   if current_user = pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class where oid=tg_relid))
      and transfers_private.current_access_role()='Driver'
      and (to_jsonb(new)-'order_status'-'updated_at') = (to_jsonb(old)-'order_status'-'updated_at')
   then return new; end if;
 if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_by_name is distinct from old.created_by_name or new.move_number is distinct from old.move_number or new.created_at is distinct from old.created_at then raise exception 'Load identity and creator cannot be changed' using errcode='42501';end if;
 if (new.scheduled_date,new.scheduled_time,new.driver) is distinct from (old.scheduled_date,old.scheduled_time,old.driver) and not (transfers_private.has_any_permission(array['edit_load','move_load','summary_edit']) or (transfers_private.has_permission('resize_load') and new.scheduled_date=old.scheduled_date and new.driver=old.driver and new.duration_minutes is distinct from old.duration_minutes)) then raise exception 'Moving loads is not permitted' using errcode='42501';end if;
 if new.duration_minutes is distinct from old.duration_minutes and not transfers_private.has_any_permission(array['edit_load','resize_load','summary_edit']) then raise exception 'Resizing loads is not permitted' using errcode='42501';end if;
 if (new.origin,new.destination,new.additional_stop,new.additional_stop_2,new.dock_number,new.destination_dock_number,new.pallet_count,new.packing_slip,new.job_number,new.order_status) is distinct from (old.origin,old.destination,old.additional_stop,old.additional_stop_2,old.dock_number,old.destination_dock_number,old.pallet_count,old.packing_slip,old.job_number,old.order_status) and not transfers_private.has_any_permission(array['edit_load','summary_edit']) then raise exception 'Editing loads is not permitted' using errcode='42501';end if;
 if new.linked_next_id is distinct from old.linked_next_id and not transfers_private.has_permission('link_boxes') then raise exception 'Linking loads is not permitted' using errcode='42501';end if;
 if (new.urgent,new.pickup_by_date,new.pickup_by_time,new.deliver_by_date,new.deliver_by_time) is distinct from (old.urgent,old.pickup_by_date,old.pickup_by_time,old.deliver_by_date,old.deliver_by_time) and not transfers_private.has_permission('load_deadlines') then raise exception 'Urgency and deadline editing is not permitted' using errcode='42501';end if;
 else
 if not transfers_private.has_any_permission(array['create_load','duplicate_load','duplicate_day','restore_records']) then raise exception 'Creating loads is not permitted' using errcode='42501';end if;
 if (new.urgent or new.pickup_by_date is not null or new.pickup_by_time is not null or new.deliver_by_date is not null or new.deliver_by_time is not null) and not transfers_private.has_any_permission(array['load_deadlines','duplicate_load','duplicate_day','restore_records']) then raise exception 'Urgency and deadline access required' using errcode='42501';end if;
 end if;
 return new;
end $function$;

commit;
