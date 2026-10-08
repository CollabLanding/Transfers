
alter table public.summary_deleted_records add column restored_at timestamptz;
create or replace function transfers_private.archive_summary_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb:=to_jsonb(old); kind text; stat text;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('transfers','transfer_slot_statuses') or tg_op<>'DELETE' then raise exception 'Invalid archive trigger'; end if;
 kind:=case when tg_table_name='transfers' then 'Job' else 'Time-slot status' end;
 stat:=coalesce(payload->>'order_status',payload->>'status','');
 insert into public.summary_deleted_records(record_type,record_id,scheduled_date,driver,recorded_status,record_data)
 values(kind,old.id,old.scheduled_date,old.driver,stat,payload)
 on conflict(record_type,record_id) do update set scheduled_date=excluded.scheduled_date,driver=excluded.driver,recorded_status=excluded.recorded_status,record_data=excluded.record_data,deleted_at=now(),partial_history=false,restored_at=null;
 return old;
end $$;
revoke all on function transfers_private.archive_summary_deletion() from public,anon,authenticated;

create or replace function public.save_summary_record(
 p_type text,p_id uuid,p_deleted boolean,p_date date,p_status text,p_custom_title text default null,
 p_time time default null,p_duration integer default null,p_pallets integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.summary_deleted_records%rowtype; j jsonb; actor text; result jsonb;
begin
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
   insert into public.transfers(id,scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,
     duration_minutes,order_status,move_number,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,
     created_by,created_by_name,created_at)
   values(p_id,p_date,p_time,a.driver,j->>'origin',j->>'destination',p_pallets,j->>'job_number',
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
end $$;
revoke all on function public.save_summary_record(text,uuid,boolean,date,text,text,time,integer,integer) from public,anon;
grant execute on function public.save_summary_record(text,uuid,boolean,date,text,text,time,integer,integer) to authenticated;
grant update(restored_at) on public.summary_deleted_records to authenticated;
