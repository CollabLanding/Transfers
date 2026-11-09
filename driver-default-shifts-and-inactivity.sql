alter table public.transfer_drivers add column inactive_periods jsonb not null default '[]'::jsonb;
update public.transfer_drivers d set inactive_periods=jsonb_build_array(jsonb_build_object('from',
 coalesce((select (max(created_at) at time zone 'America/Chicago')::date from public.driver_activity a where a.driver_name=d.name and a.action='Driver marked inactive'),(now() at time zone 'America/Chicago')::date),'to',null)) where not is_active;
create or replace function transfers_private.guard_driver_active_status() returns trigger language plpgsql set search_path='' as $$
declare effective date:=(now() at time zone 'America/Chicago')::date;
begin
 if tg_op='UPDATE' and new.inactive_periods is distinct from old.inactive_periods then raise exception 'Inactivity dates are managed by status changes' using errcode='42501';end if;
 if (tg_op='INSERT' and not new.is_active) or (tg_op='UPDATE' and new.is_active is distinct from old.is_active) then
  if auth.uid() is null or not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required to change active status' using errcode='42501';end if;
 end if;
 if tg_op='INSERT' then
  new.inactive_periods:=case when new.is_active then '[]'::jsonb else jsonb_build_array(jsonb_build_object('from',effective,'to',null)) end;
 elsif new.is_active is distinct from old.is_active then
  if not new.is_active then new.inactive_periods:=old.inactive_periods||jsonb_build_array(jsonb_build_object('from',effective,'to',null));
  else select coalesce(jsonb_agg(case when item->>'to' is null then jsonb_set(item,'{to}',to_jsonb(effective)) else item end),'[]'::jsonb) into new.inactive_periods from jsonb_array_elements(old.inactive_periods) item;
  end if;
 end if;
 return new;
end $$;
alter table public.driver_schedules add column is_override boolean not null default true;
update public.driver_schedules s set is_override=false from public.transfer_drivers d
 where s.driver_name=d.name and d.weekly_schedule is not null
 and s.start_time is not distinct from nullif(d.weekly_schedule->extract(dow from s.schedule_date)::integer->>'start','')::time
 and s.end_time is not distinct from nullif(d.weekly_schedule->extract(dow from s.schedule_date)::integer->>'end','')::time;
create function transfers_private.mark_driver_schedule_override() returns trigger language plpgsql set search_path='' as $$
begin
 if current_setting('transfers.applying_driver_default',true)='on' then new.is_override:=false;
 elsif tg_op='INSERT' then new.is_override:=true;
 elsif (new.start_time,new.end_time) is distinct from (old.start_time,old.end_time) then new.is_override:=true;
 else new.is_override:=old.is_override;
 end if;
 return new;
end $$;
create trigger mark_driver_schedule_override before insert or update on public.driver_schedules for each row execute function transfers_private.mark_driver_schedule_override();
CREATE OR REPLACE FUNCTION transfers_private.board_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 return jsonb_build_object(
 'drivers',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'sort_order',sort_order,'is_active',is_active,'inactive_periods',inactive_periods) order by sort_order,name),'[]'::jsonb) from public.transfer_drivers),
 'locations',(select coalesce(jsonb_agg(jsonb_build_object('name',name) order by name),'[]'::jsonb) from public.transfer_locations));
end $function$
;
CREATE OR REPLACE FUNCTION visitor_private.read_visitor_board(p_token text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_token is null or length(p_token)<>64 or not exists(select 1 from visitor_private.board_visitor_links where active and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then raise exception 'This visitor link is invalid or has been disabled.' using errcode='42501';end if;
 if p_date is null or p_date not between date '2020-01-01' and date '2100-12-31' then raise exception 'Choose a valid date';end if;
 return jsonb_build_object(
 'date',p_date,
 'inactive_drivers',(select coalesce(jsonb_agg(name),'[]') from public.transfer_drivers where exists(select 1 from jsonb_array_elements(inactive_periods) p where p_date>=(p->>'from')::date and (p->>'to' is null or p_date<(p->>'to')::date))),
 'drivers',(select coalesce(jsonb_agg(name order by sort_order nulls last,name),'[]') from public.transfer_drivers),
 'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by scheduled_time,move_number),'[]') from (
 select id,scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,additional_stop,additional_stop_2,pallet_count,job_number,order_status,move_number,urgent,dock_number,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time from public.transfers where scheduled_date=p_date)t),
 'schedules',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select driver_name,schedule_date,start_time,end_time from public.driver_schedules where schedule_date between p_date-1 and p_date)s),
 'statuses',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select id,scheduled_date,driver,start_minutes,end_minutes,status,custom_title,notes from public.transfer_slot_statuses where scheduled_date=p_date)s)
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.apply_driver_week(p_driver text, p_month date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare w jsonb; n integer; actor text;
begin
 if not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
  if auth.uid() is null then raise exception 'Sign in to apply a schedule'; end if;
  if p_month is null or p_month <> date_trunc('month',p_month)::date then raise exception 'Choose a month'; end if;
  select weekly_schedule into w from public.transfer_drivers where name=p_driver for update;
  if w is null then raise exception 'Save a weekly schedule first'; end if;
  select display_name into actor from public.profiles where id=auth.uid();
  perform set_config('transfers.applying_driver_default','on',true);
  insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name,is_override)
  select p_driver,d::date,nullif(w->extract(dow from d)::integer->>'start','')::time,
      nullif(w->extract(dow from d)::integer->>'end','')::time,auth.uid(),coalesce(actor,'User'),false
  from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
  on conflict(driver_name,schedule_date) do nothing;
  get diagnostics n = row_count;
  perform set_config('transfers.applying_driver_default','off',true);return n;
end $function$
;
CREATE OR REPLACE FUNCTION public.replace_driver_schedule_month(p_driver text, p_month date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare w jsonb; n integer; actor text;
begin
 if not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 if auth.uid() is null then raise exception 'Sign in to apply a schedule'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'Choose a month'; end if;
 select weekly_schedule into w from public.transfer_drivers where name=p_driver for update;
 if w is null then raise exception 'Save a weekly schedule first'; end if;
 select display_name into actor from public.profiles where id=auth.uid();
 perform set_config('transfers.applying_driver_default','on',true);
  insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name,updated_at,is_override)
 select p_driver,d::date,nullif(w->extract(dow from d)::integer->>'start','')::time,nullif(w->extract(dow from d)::integer->>'end','')::time,auth.uid(),coalesce(actor,'User'),now(),false
 from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day')d
 on conflict(driver_name,schedule_date) do update set start_time=excluded.start_time,end_time=excluded.end_time,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=excluded.updated_at,is_override=false;
 get diagnostics n=row_count;
 perform set_config('transfers.applying_driver_default','off',true);return n;
end $function$
;
CREATE OR REPLACE FUNCTION transfers_private.prepare_driver_months()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare target date:=(date_trunc('month',now() at time zone 'America/Chicago')+interval '1 month')::date;
  r record; n integer; total integer:=0;
begin
  for r in select name,weekly_schedule from public.transfer_drivers
    where is_active and auto_repeat and weekly_schedule is not null and (auto_generated_month is null or auto_generated_month<target) for update loop
    perform set_config('transfers.applying_driver_default','on',true);
  insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by_name,is_override)
    select r.name,d::date,nullif(r.weekly_schedule->extract(dow from d)::integer->>'start','')::time,
      nullif(r.weekly_schedule->extract(dow from d)::integer->>'end','')::time,'Automatic schedule',false
    from generate_series(target::timestamp,(target+interval '1 month - 1 day')::timestamp,interval '1 day') d
    on conflict(driver_name,schedule_date) do nothing;
    get diagnostics n = row_count; total:=total+n;
    update public.transfer_drivers set auto_generated_month=target where name=r.name;
  end loop;
  perform set_config('transfers.applying_driver_default','off',true);return total;
end $function$
;
create function public.save_driver_default_week(p_driver text,p_week jsonb,p_expected jsonb) returns jsonb language plpgsql set search_path='' as $$
declare old_week jsonb; actor text; from_date date:=(now() at time zone 'America/Chicago')::date; through_date date; changed integer:=0;
begin
 if auth.uid() is null or not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 if p_week is null or not public.valid_driver_week(p_week) then raise exception 'Enter seven valid days, with both times or a day off';end if;
 select weekly_schedule into old_week from public.transfer_drivers where name=p_driver for update;
 if not found then raise exception 'Driver no longer exists';end if;
 if old_week is distinct from p_expected then raise exception 'The default shift changed. Reopen Driver List and try again.';end if;
 select split_part(coalesce(display_name,'User'),'@',1) into actor from public.profiles where id=auth.uid();
 through_date:=(date_trunc('month',from_date)+interval '2 months - 1 day')::date;
 update public.transfer_drivers set weekly_schedule=p_week,auto_repeat=true,auto_generated_month=(date_trunc('month',from_date)+interval '1 month')::date where name=p_driver;
 perform set_config('transfers.applying_driver_default','on',true);
 update public.driver_schedules set
 start_time=nullif(p_week->extract(dow from schedule_date)::integer->>'start','')::time,
 end_time=nullif(p_week->extract(dow from schedule_date)::integer->>'end','')::time,
 updated_by=auth.uid(),updated_by_name=coalesce(actor,'User'),updated_at=now()
 where driver_name=p_driver and schedule_date>=from_date and not is_override;
 insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name,is_override)
 select p_driver,d::date,nullif(p_week->extract(dow from d)::integer->>'start','')::time,
 nullif(p_week->extract(dow from d)::integer->>'end','')::time,auth.uid(),coalesce(actor,'User'),false
 from generate_series(from_date::timestamp,through_date::timestamp,interval '1 day')d
 on conflict(driver_name,schedule_date) do nothing;
 get diagnostics changed=row_count;
 perform set_config('transfers.applying_driver_default','off',true);
 insert into public.driver_activity(driver_name,action,details,actor_id,actor_name) values
 (p_driver,'Default shift updated','Effective '||from_date||' · '||p_week::text||' · Daily overrides kept',auth.uid(),coalesce(actor,'User'));
 return jsonb_build_object('weekly_schedule',p_week,'prepared_through',through_date,'auto_repeat',true);
end $$;
revoke all on function public.save_driver_default_week(text,jsonb,jsonb) from public,anon;
grant execute on function public.save_driver_default_week(text,jsonb,jsonb) to authenticated;
