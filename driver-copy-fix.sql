create or replace function public.replace_driver_schedule_month(p_driver text,p_month date)
returns integer language plpgsql security invoker set search_path='' as $$
declare w jsonb; n integer; actor text;
begin
 if auth.uid() is null then raise exception 'Sign in to apply a schedule'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'Choose a month'; end if;
 select weekly_schedule into w from public.transfer_drivers where name=p_driver for update;
 if w is null then raise exception 'Save a weekly schedule first'; end if;
 select display_name into actor from public.profiles where id=auth.uid();
 insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name,updated_at)
 select p_driver,d::date,nullif(w->extract(dow from d)::integer->>'start','')::time,nullif(w->extract(dow from d)::integer->>'end','')::time,auth.uid(),coalesce(actor,'User'),now()
 from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day')d
 on conflict(driver_name,schedule_date) do update set start_time=excluded.start_time,end_time=excluded.end_time,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=excluded.updated_at;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.replace_driver_schedule_month(text,date) from public,anon;
grant execute on function public.replace_driver_schedule_month(text,date) to authenticated;