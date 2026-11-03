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
 v_job:=coalesce(trim(p_data->>'job_number'),'');v_status:=coalesce(nullif(p_data->>'order_status',''),'Planned');
 if v_date is null or v_time is null or v_driver is null or v_origin is null or v_destination is null then raise exception 'Complete all fields';end if;
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
