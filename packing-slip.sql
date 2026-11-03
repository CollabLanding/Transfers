begin;
alter table public.transfers add column if not exists packing_slip jsonb;
create or replace function transfers_private.validate_packing_slip()
returns trigger language plpgsql set search_path='' as $$
declare line jsonb; part jsonb; n integer; total integer:=0;
begin
 if new.packing_slip is null then return new; end if;
 if jsonb_typeof(new.packing_slip)<>'array' or jsonb_array_length(new.packing_slip) not between 1 and 100 then raise exception 'Invalid packing slip lines';end if;
 for line in select value from jsonb_array_elements(new.packing_slip) loop
  if coalesce(line->>'pallets','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid pallet count on packing slip';end if;
  n:=(line->>'pallets')::int;
  if n<1 then raise exception 'Pallet count must be at least one';end if;
  if jsonb_typeof(line->'parts') is distinct from 'array' or jsonb_array_length(line->'parts') not between 1 and 30 or length(coalesce(line->>'notes',''))>500 then raise exception 'Invalid packing slip line';end if;
  for part in select value from jsonb_array_elements(line->'parts') loop
   if length(trim(coalesce(part->>'number',''))) not between 1 and 120 or (part->>'pieces' is not null and part->>'pieces' !~ '^[1-9][0-9]{0,5}$') then raise exception 'Invalid packing slip part';end if;
  end loop;
  total:=total+n;
 end loop;
 if total>999 or total is distinct from new.pallet_count then raise exception 'Pallet total must match the packing slip';end if;
 return new;
end $$;
create or replace trigger validate_packing_slip before insert or update of packing_slip,pallet_count on public.transfers for each row execute function transfers_private.validate_packing_slip();
CREATE OR REPLACE FUNCTION public.overwrite_transfer_day(p_source date, p_destination date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare source_rows jsonb; row_data public.transfers; copied integer:=0; removed integer:=0; creator text;
begin
 if auth.uid() is null or not transfers_private.has_permission('duplicate_day') or not transfers_private.has_permission('delete_load') then raise exception 'Duplicate Day and Delete Load permissions are required to overwrite a day.' using errcode='42501';end if;
 if p_source is null or p_destination is null or p_source=p_destination then raise exception 'Choose a different destination day.';end if;
 if p_source not between date '2020-01-01' and date '2100-12-31' or p_destination not between date '2020-01-01' and date '2100-12-31' then raise exception 'Choose a valid date.';end if;
 perform pg_advisory_xact_lock(7021,least(p_source,p_destination)-date '2000-01-01');
 perform pg_advisory_xact_lock(7021,greatest(p_source,p_destination)-date '2000-01-01');
 select jsonb_agg(to_jsonb(t) order by t.scheduled_time,t.move_number) into source_rows from (select * from public.transfers where scheduled_date=p_source for share) t;
 if coalesce(jsonb_array_length(source_rows),0)=0 then raise exception 'There are no transfers on the source day to duplicate.';end if;
 select coalesce(nullif(display_name,''),nullif(split_part(auth.jwt()->>'email','@',1),''),'User') into creator from public.profiles where id=auth.uid();
 creator:=coalesce(creator,'User');
 perform id from public.transfers where scheduled_date=p_destination order by id for update;
 delete from public.transfers where scheduled_date=p_destination;
 get diagnostics removed=row_count;
 if exists(select 1 from public.transfers where scheduled_date=p_destination) then raise exception 'Not all destination jobs could be replaced.';end if;
 for row_data in select * from jsonb_populate_recordset(null::public.transfers,source_rows) loop
  insert into public.transfers(scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,additional_stop,additional_stop_2,dock_number,pallet_count,packing_slip,job_number,order_status,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,created_by,created_by_name)
  values(p_destination,row_data.scheduled_time,row_data.duration_minutes,row_data.driver,row_data.origin,row_data.destination,row_data.additional_stop,row_data.additional_stop_2,row_data.dock_number,row_data.pallet_count,row_data.packing_slip,row_data.job_number,'Planned',row_data.urgent,row_data.pickup_by_date+(p_destination-p_source),row_data.pickup_by_time,row_data.deliver_by_date+(p_destination-p_source),row_data.deliver_by_time,auth.uid(),creator);
  copied:=copied+1;
 end loop;
 return jsonb_build_object('copied',copied,'removed',removed);
end $function$;
CREATE OR REPLACE FUNCTION transfers_private.build_vendor_transfer(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_name text;v_move bigint;
 v_date date;v_time time;v_duration integer;v_pallets integer;
 v_driver text;v_origin text;v_destination text;v_job text;v_status text;
begin
 if v_actor is null or not transfers_private.has_permission('create_load') then raise exception 'Build transfer access required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Complete all fields';end if;
 v_date:=(p_data->>'scheduled_date')::date;
 v_time:=(p_data->>'scheduled_time')::time;
 v_duration:=(p_data->>'duration_minutes')::integer;
 v_pallets:=(p_data->>'pallet_count')::integer;
 v_driver:=trim(p_data->>'driver');v_origin:=trim(p_data->>'origin');v_destination:=trim(p_data->>'destination');
 v_job:=trim(p_data->>'job_number');v_status:=coalesce(nullif(p_data->>'order_status',''),'Planned');
 if v_date is null or v_time is null or v_driver is null or v_origin is null or v_destination is null or v_job is null or v_job='' then raise exception 'Complete all fields';end if;
 if v_time<'04:00'::time or v_time>'20:00'::time then raise exception 'Scheduled time must be between 4:00 AM and 8:00 PM';end if;
 if v_duration is null or v_duration<15 or v_duration>720 or v_duration%15<>0 then raise exception 'Choose a valid load duration';end if;
 if v_pallets is null or v_pallets<0 or v_pallets>999 then raise exception 'Choose a valid pallet count';end if;
 if lower(v_origin)=lower(v_destination) and nullif(trim(p_data->>'additional_stop'),'') is null and nullif(trim(p_data->>'additional_stop_2'),'') is null then raise exception 'Origination and destination must be different';end if;
 if not exists(select 1 from public.transfer_drivers where name=v_driver) then raise exception 'Choose an existing driver';end if;
 if not exists(select 1 from public.transfer_locations where name=v_origin) or not exists(select 1 from public.transfer_locations where name=v_destination) then raise exception 'Choose existing locations';end if;
 if exists(select 1 from (values(nullif(trim(p_data->>'additional_stop'),'')),(nullif(trim(p_data->>'additional_stop_2'),''))) stops(name) where name is not null and not exists(select 1 from public.transfer_locations l where l.name=stops.name)) then raise exception 'Choose existing additional stop locations';end if;
 if v_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered') then raise exception 'Choose a valid status';end if;
 select display_name into v_name from public.profiles where id=v_actor;
 insert into public.transfers(scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,additional_stop,additional_stop_2,dock_number,pallet_count,packing_slip,job_number,order_status,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,created_by,created_by_name)
 values(v_date,v_time,v_duration,v_driver,v_origin,v_destination,nullif(trim(p_data->>'additional_stop'),''),nullif(trim(p_data->>'additional_stop_2'),''),nullif(p_data->>'dock_number','')::smallint,v_pallets,nullif(p_data->'packing_slip','null'::jsonb),v_job,v_status,coalesce((p_data->>'urgent')::boolean,false),nullif(p_data->>'pickup_by_date','')::date,nullif(p_data->>'pickup_by_time','')::time,nullif(p_data->>'deliver_by_date','')::date,nullif(p_data->>'deliver_by_time','')::time,v_actor,coalesce(nullif(v_name,''),'Vendor'))
 returning move_number into v_move;
 return jsonb_build_object('move_number',v_move,'scheduled_date',v_date);
end $function$;
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
 if (new.origin,new.destination,new.additional_stop,new.additional_stop_2,new.dock_number,new.pallet_count,new.packing_slip,new.job_number,new.order_status) is distinct from (old.origin,old.destination,old.additional_stop,old.additional_stop_2,old.dock_number,old.pallet_count,old.packing_slip,old.job_number,old.order_status) and not transfers_private.has_any_permission(array['edit_load','summary_edit']) then raise exception 'Editing loads is not permitted' using errcode='42501';end if;
 if new.linked_next_id is distinct from old.linked_next_id and not transfers_private.has_permission('link_boxes') then raise exception 'Linking loads is not permitted' using errcode='42501';end if;
 if (new.urgent,new.pickup_by_date,new.pickup_by_time,new.deliver_by_date,new.deliver_by_time) is distinct from (old.urgent,old.pickup_by_date,old.pickup_by_time,old.deliver_by_date,old.deliver_by_time) and not transfers_private.has_permission('load_deadlines') then raise exception 'Urgency and deadline editing is not permitted' using errcode='42501';end if;
 else
 if not transfers_private.has_any_permission(array['create_load','duplicate_load','duplicate_day','restore_records']) then raise exception 'Creating loads is not permitted' using errcode='42501';end if;
 if (new.urgent or new.pickup_by_date is not null or new.pickup_by_time is not null or new.deliver_by_date is not null or new.deliver_by_time is not null) and not transfers_private.has_any_permission(array['load_deadlines','duplicate_load','duplicate_day','restore_records']) then raise exception 'Urgency and deadline access required' using errcode='42501';end if;
 end if;
 return new;
end $function$;
commit;