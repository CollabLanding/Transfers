
alter table public.transfer_drivers
  add column full_name text not null default '',
  add column email text not null default '',
  add column notes text not null default '',
  add column weekly_schedule jsonb,
  add column auto_repeat boolean not null default false,
  add column auto_generated_month date;
-- Shared dispatch editing follows the existing shared schedule access model.
create policy "transfer drivers profile update" on public.transfer_drivers
  for update to authenticated using (true) with check (true);

create or replace function public.valid_driver_week(p_week jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d jsonb; s text; e text;
begin
  if p_week is null then return true; end if;
  if jsonb_typeof(p_week) <> 'array' then return false; end if;
  if jsonb_array_length(p_week) <> 7 then return false; end if;
  for d in select value from jsonb_array_elements(p_week) loop
    if jsonb_typeof(d) <> 'object' then return false; end if;
    s:=nullif(d->>'start',''); e:=nullif(d->>'end','');
    if (s is null) <> (e is null) then return false; end if;
    if s is not null and (s !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or e !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or s=e) then return false; end if;
  end loop;
  return true;
end $$;
alter table public.transfer_drivers add constraint driver_week_valid check(public.valid_driver_week(weekly_schedule));
alter table public.transfer_drivers add constraint driver_repeat_has_week check(not auto_repeat or weekly_schedule is not null);
-- Use an unambiguous literal plus sign for stored international phone numbers.
alter table public.transfer_drivers drop constraint transfer_drivers_phone_number_check;
alter table public.transfer_drivers add constraint transfer_drivers_phone_number_check check(phone_number is null or phone_number ~ '^[+][1-9][0-9]{7,14}$');

create or replace function public.apply_driver_week(p_driver text,p_month date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare w jsonb; n integer; actor text;
begin
  if auth.uid() is null then raise exception 'Sign in to apply a schedule'; end if;
  if p_month is null or p_month <> date_trunc('month',p_month)::date then raise exception 'Choose a month'; end if;
  select weekly_schedule into w from public.transfer_drivers where name=p_driver for update;
  if w is null then raise exception 'Save a weekly schedule first'; end if;
  select display_name into actor from public.profiles where id=auth.uid();
  insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name)
  select p_driver,d::date,nullif(w->extract(dow from d)::integer->>'start','')::time,
      nullif(w->extract(dow from d)::integer->>'end','')::time,auth.uid(),coalesce(actor,'User')
  from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
  on conflict(driver_name,schedule_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.save_driver_profile(p_original text,p_name text,p_full_name text,p_phone text,p_email text,p_notes text,p_week jsonb,p_repeat boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_name text:=btrim(p_name); target date:=(date_trunc('month',now() at time zone 'America/Chicago')+interval '1 month')::date;
  last_month date; n integer:=0; actor text;
begin
  if auth.uid() is null then raise exception 'Sign in to save a driver'; end if;
  if v_name is null or length(v_name) not between 1 and 120 or lower(v_name)='planning' then raise exception 'Enter a driver slot name other than Planning'; end if;
  if p_original is not null and p_original <> v_name then raise exception 'The existing driver slot name cannot be changed'; end if;
  if p_week is null or not public.valid_driver_week(p_week) then raise exception 'Provide seven valid days with both times or a day off'; end if;
  if length(coalesce(p_full_name,''))>200 or length(coalesce(p_email,''))>254 or length(coalesce(p_notes,''))>3000 then raise exception 'Driver information is too long'; end if;
  select display_name into actor from public.profiles where id=auth.uid();
  if p_original is null then
    insert into public.transfer_drivers(name,full_name,phone_number,email,notes,weekly_schedule,auto_repeat,created_by,created_by_name)
    values(v_name,btrim(p_full_name),nullif(btrim(p_phone),''),btrim(p_email),btrim(p_notes),p_week,coalesce(p_repeat,false),auth.uid(),coalesce(actor,'User'));
  else
    update public.transfer_drivers set full_name=btrim(p_full_name),phone_number=nullif(btrim(p_phone),''),email=btrim(p_email),notes=btrim(p_notes),weekly_schedule=p_week,auto_repeat=coalesce(p_repeat,false)
    where name=p_original;
    if not found then raise exception 'Driver no longer exists'; end if;
  end if;
  select auto_generated_month into last_month from public.transfer_drivers where name=v_name for update;
  if p_repeat and (last_month is null or last_month<target) then
    n:=public.apply_driver_week(v_name,target);
    update public.transfer_drivers set auto_generated_month=target where name=v_name;
  end if;
  return jsonb_build_object('name',v_name,'generated_days',n,'generated_month',case when p_repeat then target else null end);
end $$;
revoke all on function public.valid_driver_week(jsonb) from public,anon;
grant execute on function public.valid_driver_week(jsonb) to authenticated;
revoke all on function public.apply_driver_week(text,date) from public,anon;
grant execute on function public.apply_driver_week(text,date) to authenticated;
revoke all on function public.save_driver_profile(text,text,text,text,text,text,jsonb,boolean) from public,anon;
grant execute on function public.save_driver_profile(text,text,text,text,text,text,jsonb,boolean) to authenticated;

create schema if not exists transfers_private;
revoke all on schema transfers_private from public,anon,authenticated;
create or replace function transfers_private.prepare_driver_months()
returns integer language plpgsql security invoker set search_path = '' as $$
declare target date:=(date_trunc('month',now() at time zone 'America/Chicago')+interval '1 month')::date;
  r record; n integer; total integer:=0;
begin
  for r in select name,weekly_schedule from public.transfer_drivers
    where auto_repeat and weekly_schedule is not null and (auto_generated_month is null or auto_generated_month<target) for update loop
    insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by_name)
    select r.name,d::date,nullif(r.weekly_schedule->extract(dow from d)::integer->>'start','')::time,
      nullif(r.weekly_schedule->extract(dow from d)::integer->>'end','')::time,'Automatic schedule'
    from generate_series(target::timestamp,(target+interval '1 month - 1 day')::timestamp,interval '1 day') d
    on conflict(driver_name,schedule_date) do nothing;
    get diagnostics n = row_count; total:=total+n;
    update public.transfer_drivers set auto_generated_month=target where name=r.name;
  end loop;
  return total;
end $$;
revoke all on function transfers_private.prepare_driver_months() from public,anon,authenticated;
create extension if not exists pg_cron with schema pg_catalog;
-- Midnight Chicago is 05:00 or 06:00 UTC. Both runs make the month ready at midnight in either season.
select cron.schedule('transfers-prepare-driver-months','0 5,6 * * *','select transfers_private.prepare_driver_months();');

grant execute on function public.valid_driver_week(jsonb) to service_role;
alter table public.driver_schedules alter column start_time drop not null, alter column end_time drop not null;
alter table public.driver_schedules add constraint driver_schedule_complete_times check ((start_time is null) = (end_time is null));
