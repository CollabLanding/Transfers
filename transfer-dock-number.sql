alter table public.transfers add column dock_number smallint check(dock_number between 1 and 53);
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
 if lower(v_origin)=lower(v_destination) then raise exception 'Origination and destination must be different';end if;
 if not exists(select 1 from public.transfer_drivers where name=v_driver) then raise exception 'Choose an existing driver';end if;
 if not exists(select 1 from public.transfer_locations where name=v_origin) or not exists(select 1 from public.transfer_locations where name=v_destination) then raise exception 'Choose existing locations';end if;
 if v_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered') then raise exception 'Choose a valid status';end if;
 select display_name into v_name from public.profiles where id=v_actor;
 insert into public.transfers(scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,dock_number,pallet_count,job_number,order_status,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,created_by,created_by_name)
 values(v_date,v_time,v_duration,v_driver,v_origin,v_destination,nullif(p_data->>'dock_number','')::smallint,v_pallets,v_job,v_status,coalesce((p_data->>'urgent')::boolean,false),nullif(p_data->>'pickup_by_date','')::date,nullif(p_data->>'pickup_by_time','')::time,nullif(p_data->>'deliver_by_date','')::date,nullif(p_data->>'deliver_by_time','')::time,v_actor,coalesce(nullif(v_name,''),'Vendor'))
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
 if (new.origin,new.destination,new.dock_number,new.pallet_count,new.job_number,new.order_status) is distinct from (old.origin,old.destination,old.dock_number,old.pallet_count,old.job_number,old.order_status) and not transfers_private.has_any_permission(array['edit_load','summary_edit']) then raise exception 'Editing loads is not permitted' using errcode='42501';end if;
 if new.linked_next_id is distinct from old.linked_next_id and not transfers_private.has_permission('link_boxes') then raise exception 'Linking loads is not permitted' using errcode='42501';end if;
 if (new.urgent,new.pickup_by_date,new.pickup_by_time,new.deliver_by_date,new.deliver_by_time) is distinct from (old.urgent,old.pickup_by_date,old.pickup_by_time,old.deliver_by_date,old.deliver_by_time) and not transfers_private.has_permission('load_deadlines') then raise exception 'Urgency and deadline editing is not permitted' using errcode='42501';end if;
 else
 if not transfers_private.has_any_permission(array['create_load','duplicate_load','duplicate_day','restore_records']) then raise exception 'Creating loads is not permitted' using errcode='42501';end if;
 if (new.urgent or new.pickup_by_date is not null or new.pickup_by_time is not null or new.deliver_by_date is not null or new.deliver_by_time is not null) and not transfers_private.has_any_permission(array['load_deadlines','duplicate_load','duplicate_day','restore_records']) then raise exception 'Urgency and deadline access required' using errcode='42501';end if;
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.save_summary_record(p_type text, p_id uuid, p_deleted boolean, p_date date, p_status text, p_custom_title text DEFAULT NULL::text, p_time time without time zone DEFAULT NULL::time without time zone, p_duration integer DEFAULT NULL::integer, p_pallets integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.summary_deleted_records%rowtype; j jsonb; actor text; result jsonb;
begin
 if p_deleted and p_status<>'Deleted' then
 if not transfers_private.has_permission('restore_records') then raise exception 'Restoration access required' using errcode='42501';end if;
 elsif not transfers_private.has_permission('summary_edit') then raise exception 'Report editing access required' using errcode='42501';end if;
 if auth.uid() is null then raise exception 'Sign in to edit report records'; end if;
 if p_date is null then raise exception 'Choose a date'; end if;
 if not p_deleted then
   perform public.edit_summary_record(p_type,p_id,false,p_date,p_status,p_custom_title);
   return jsonb_build_object('restored',false);
 end if;
 select * into a from public.summary_deleted_records where record_type=p_type and record_id=p_id and restored_at is null for update;
 if not found then raise exception 'Deleted record is no longer available. Run the report again.'; end if;
 j:=a.record_data;
 if p_status='Deleted' then
   perform public.edit_summary_record(p_type,p_id,true,p_date,a.recorded_status,j->>'custom_title');
   return jsonb_build_object('restored',false);
 end if;
 select display_name into actor from public.profiles where id=auth.uid();
 if p_type='Job' then
   if p_status is null or p_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered') then raise exception 'Choose a valid job status'; end if;
   p_time:=coalesce(p_time,(j->>'scheduled_time')::time);
   p_duration:=coalesce(p_duration,(j->>'duration_minutes')::integer);
   p_pallets:=coalesce(p_pallets,(j->>'pallet_count')::integer);
   if p_time is null or p_duration is null or p_pallets is null then raise exception 'Enter the time, duration and pallet count needed to restore this load'; end if;
   if p_time<'04:00'::time or p_time>'20:00'::time then raise exception 'Restored load time must be between 4 AM and 8 PM'; end if;
   if nullif(j->>'origin','') is null or nullif(j->>'destination','') is null or nullif(j->>'job_number','') is null then raise exception 'This older record lacks route or job details required for restoration'; end if;
   insert into public.transfers(id,scheduled_date,scheduled_time,driver,origin,destination,dock_number,pallet_count,job_number,
     duration_minutes,order_status,move_number,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,
     created_by,created_by_name,created_at)
   values(p_id,p_date,p_time,a.driver,j->>'origin',j->>'destination',(j->>'dock_number')::smallint,p_pallets,j->>'job_number',
     p_duration,p_status,coalesce((j->>'move_number')::bigint,nextval('public.transfer_move_number_seq'::regclass)),
     coalesce((j->>'urgent')::boolean,false),(j->>'pickup_by_date')::date,(j->>'pickup_by_time')::time,(j->>'deliver_by_date')::date,(j->>'deliver_by_time')::time,
     auth.uid(),coalesce(nullif(j->>'created_by_name',''),actor,'User'),coalesce((j->>'created_at')::timestamptz,now()))
   returning to_jsonb(transfers.*) into result;
 elsif p_type='Time-slot status' then
   if p_status is null or p_status not in ('Driving','Yard Moves','Loading','Standby','Job Pushed','Custom') then raise exception 'Choose a valid time-slot status'; end if;
   if p_status='Custom' and (nullif(btrim(p_custom_title),'') is null or length(p_custom_title)>80) then raise exception 'Enter a custom title of up to 80 characters'; end if;
   if exists(select 1 from public.transfer_slot_statuses where driver=a.driver and scheduled_date=p_date and start_minutes<(j->>'end_minutes')::integer and end_minutes>(j->>'start_minutes')::integer) then raise exception 'This status overlaps an existing time-slot status on that date'; end if;
   insert into public.transfer_slot_statuses(id,scheduled_date,driver,start_minutes,end_minutes,status,custom_title,notes,created_by,created_at)
   values(p_id,p_date,a.driver,(j->>'start_minutes')::integer,(j->>'end_minutes')::integer,p_status,
     case when p_status='Custom' then btrim(p_custom_title) else null end,j->>'notes',auth.uid(),coalesce((j->>'created_at')::timestamptz,now()))
   returning to_jsonb(transfer_slot_statuses.*) into result;
 else raise exception 'Invalid record type';
 end if;
 update public.summary_deleted_records set restored_at=now() where id=a.id;
 return jsonb_build_object('restored',true,'record',result);
end $function$;
