-- Driver job types and automatic Yard Moves blocks, applied 2026-10-28.

begin;
alter table public.transfer_drivers add column job_type text not null default 'Shuttle' check(job_type in ('Shuttle','Terminal Truck'));
alter table public.transfer_slot_statuses add column auto_schedule_id uuid;
create unique index terminal_status_schedule_day on public.transfer_slot_statuses(auto_schedule_id,scheduled_date) where auto_schedule_id is not null;
CREATE OR REPLACE FUNCTION transfers_private.enforce_driver_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
 if new.name is distinct from old.name and transfers_private.current_access_role() not in ('Owner','Admin') then raise exception 'Only Admin and Owner accounts can rename driver slots' using errcode='42501';end if;
 if new.sort_order is distinct from old.sort_order and not transfers_private.has_permission('reorder_drivers') then raise exception 'Driver ordering access required' using errcode='42501';end if;
 if new.phone_number is distinct from old.phone_number and not transfers_private.has_permission('driver_phones') then raise exception 'Driver phone access required' using errcode='42501';end if;
 if (new.full_name,new.email,new.notes,new.job_type) is distinct from (old.full_name,old.email,old.notes,old.job_type) and not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required' using errcode='42501';end if;
 if (new.weekly_schedule,new.auto_repeat,new.auto_generated_month) is distinct from (old.weekly_schedule,old.auto_repeat,old.auto_generated_month) and not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 else
 if nullif(new.phone_number,'') is not null and not transfers_private.has_permission('driver_phones') then raise exception 'Driver phone access required' using errcode='42501';end if;
 if (new.auto_repeat or exists(select 1 from jsonb_array_elements(new.weekly_schedule)d where nullif(d->>'start','') is not null)) and not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION transfers_private.enforce_status_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if current_user in ('postgres','supabase_admin') and pg_trigger_depth()>1 then return new;end if;
 if auth.uid() is null or tg_op='INSERT' then return new;end if;
 if (new.driver,new.scheduled_date,new.start_minutes,new.end_minutes) is distinct from (old.driver,old.scheduled_date,old.start_minutes,old.end_minutes) and not transfers_private.has_any_permission(array['manage_status','summary_edit']) then raise exception 'Moving or resizing statuses is not permitted' using errcode='42501';end if;
 if (new.notes,new.custom_title,new.status) is distinct from (old.notes,old.custom_title,old.status) and not transfers_private.has_any_permission(array['status_notes','summary_edit']) then raise exception 'Editing status notes is not permitted' using errcode='42501';end if;
 return new;
end $function$;

create or replace function transfers_private.sync_terminal_schedule(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.driver_schedules; actor uuid; kind text; a int; b int; dates date[]:='{}'; d date; lo int; hi int;
begin
 select * into s from public.driver_schedules where id=p_id for update;
 if found then
  select job_type,coalesce(auth.uid(),s.updated_by,created_by) into kind,actor from public.transfer_drivers where name=s.driver_name;
 end if;
 if s.id is not null and kind='Terminal Truck' and s.start_time is not null and s.end_time is not null and s.start_time<>s.end_time then
  a:=extract(hour from s.start_time)::int*60+extract(minute from s.start_time)::int;
  b:=extract(hour from s.end_time)::int*60+extract(minute from s.end_time)::int;
  for part in 0..case when b<a then 1 else 0 end loop
   d:=s.schedule_date+part;
   lo:=greatest(210,case when part=0 then a else 0 end);
   hi:=least(1320,case when b<a and part=0 then 1440 else b end);
   lo:=ceil(lo/15.0)::int*15;hi:=floor(hi/15.0)::int*15;
   if hi-lo>=30 and actor is not null then
    dates:=array_append(dates,d);
    insert into public.transfer_slot_statuses(driver,scheduled_date,start_minutes,end_minutes,status,created_by,auto_schedule_id)
    values(s.driver_name,d,lo,hi,'Yard Moves',actor,s.id)
    on conflict(auto_schedule_id,scheduled_date) where auto_schedule_id is not null
    do update set driver=excluded.driver,start_minutes=excluded.start_minutes,end_minutes=excluded.end_minutes,status='Yard Moves'
    where (transfer_slot_statuses.driver,transfer_slot_statuses.start_minutes,transfer_slot_statuses.end_minutes,transfer_slot_statuses.status)
      is distinct from (excluded.driver,excluded.start_minutes,excluded.end_minutes,'Yard Moves');
   end if;
  end loop;
 end if;
 delete from public.transfer_slot_statuses where auto_schedule_id=p_id and not(scheduled_date=any(dates));
end $$;
revoke all on function transfers_private.sync_terminal_schedule(uuid) from public,anon,authenticated;
create or replace function transfers_private.terminal_schedule_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform transfers_private.sync_terminal_schedule(old.id);return old;end if;
 perform transfers_private.sync_terminal_schedule(new.id);return new;
end $$;
revoke all on function transfers_private.terminal_schedule_changed() from public,anon,authenticated;
create or replace trigger sync_terminal_schedule after insert or update or delete on public.driver_schedules for each row execute function transfers_private.terminal_schedule_changed();
create or replace function transfers_private.terminal_job_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare s record;
begin
 if tg_op='INSERT' or new.job_type is distinct from old.job_type then
  for s in select id from public.driver_schedules where driver_name=new.name order by schedule_date,id loop
   perform transfers_private.sync_terminal_schedule(s.id);
  end loop;
 end if;
 return new;
end $$;
revoke all on function transfers_private.terminal_job_changed() from public,anon,authenticated;
create or replace trigger sync_terminal_job after insert or update of job_type on public.transfer_drivers for each row execute function transfers_private.terminal_job_changed();
create or replace function transfers_private.protect_auto_schedule_marker()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin') and
  (case when tg_op='INSERT' then new.auto_schedule_id is not null else new.auto_schedule_id is distinct from old.auto_schedule_id end)
 then raise exception 'Automatic schedule references cannot be edited' using errcode='42501';end if;
 return new;
end $$;
revoke all on function transfers_private.protect_auto_schedule_marker() from public,anon,authenticated;
create or replace trigger protect_auto_schedule_marker before insert or update on public.transfer_slot_statuses for each row execute function transfers_private.protect_auto_schedule_marker();
create or replace function public.save_driver_profile_with_job_type(p_original text,p_name text,p_full_name text,p_phone text,p_email text,p_notes text,p_week jsonb,p_repeat boolean,p_job_type text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required' using errcode='42501';end if;
 if p_job_type is null or p_job_type not in ('Shuttle','Terminal Truck') then raise exception 'Choose Shuttle or Terminal Truck';end if;
 result:=public.save_driver_profile(p_original,p_name,p_full_name,p_phone,p_email,p_notes,p_week,p_repeat);
 update public.transfer_drivers set job_type=p_job_type where name=result->>'name';
 return result||jsonb_build_object('job_type',p_job_type);
end $$;
revoke all on function public.save_driver_profile_with_job_type(text,text,text,text,text,text,jsonb,boolean,text) from public,anon;
grant execute on function public.save_driver_profile_with_job_type(text,text,text,text,text,text,jsonb,boolean,text) to authenticated;
commit;
