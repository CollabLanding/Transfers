create table public.driver_downtime(
 id uuid primary key default gen_random_uuid(), driver_name text not null,
 schedule_date date not null, start_minute integer not null check(start_minute>=0 and start_minute<2880),
 end_minute integer not null check(end_minute>start_minute and end_minute<=2880),
 reason text not null check(reason in ('Equipment failure','Driver unavailable','Other')),
 notes text not null default '' check(length(notes)<=1000),
 updated_by uuid not null default auth.uid(), updated_by_name text not null default 'User',
 updated_at timestamptz not null default now());
create index on public.driver_downtime(driver_name,schedule_date);
alter table public.driver_downtime enable row level security;
revoke all on public.driver_downtime from anon,authenticated;
grant select,insert,update,delete on public.driver_downtime to authenticated;
create policy downtime_read on public.driver_downtime for select to authenticated using ((select transfers_private.has_any_permission(array['driver_schedules','driver_reports','driver_activity'])));
create policy downtime_write on public.driver_downtime for all to authenticated using ((select transfers_private.has_permission('driver_schedules'))) with check ((select transfers_private.has_permission('driver_schedules')) and updated_by=(select auth.uid()));
create function transfers_private.validate_driver_downtime() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.driver_name||new.schedule_date::text,0));
 if exists(select 1 from public.driver_downtime d where d.driver_name=new.driver_name and d.schedule_date=new.schedule_date and d.id<>new.id and d.start_minute<new.end_minute and d.end_minute>new.start_minute) then raise exception 'Downtime entries cannot overlap.';end if;
 new.updated_by=auth.uid();new.updated_at=now();
 select split_part(coalesce(p.display_name,'User'),'@',1) into new.updated_by_name from public.profiles p where p.id=auth.uid();
 new.updated_by_name=coalesce(new.updated_by_name,'User');
 return new;
end $$;
create trigger validate_driver_downtime before insert or update on public.driver_downtime for each row execute function transfers_private.validate_driver_downtime();
create function transfers_private.audit_driver_downtime() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.driver_downtime; actor text;
begin
 if tg_op='DELETE' then r=old;else r=new;end if;
 select split_part(coalesce(p.display_name,'User'),'@',1) into actor from public.profiles p where p.id=auth.uid();
 insert into public.driver_activity(driver_name,action,details,actor_id,actor_name)
 values(r.driver_name,'Downtime '||lower(tg_op),
 r.schedule_date::text||' · '||case when tg_op='UPDATE' then 'Previous: '||row_to_json(old)::text||' → ' else '' end||row_to_json(r)::text,auth.uid(),coalesce(actor,'User'));
 return coalesce(new,old);
end $$;
revoke all on function transfers_private.audit_driver_downtime() from public,anon,authenticated;
create trigger audit_driver_downtime after insert or update or delete on public.driver_downtime for each row execute function transfers_private.audit_driver_downtime();
alter publication supabase_realtime add table public.driver_downtime;
create or replace function transfers_private.audit_driver_downtime() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.driver_downtime; actor text; detail text; previous text;
begin
 if tg_op='DELETE' then r=old;else r=new;end if;
 select split_part(coalesce(p.display_name,'User'),'@',1) into actor from public.profiles p where p.id=auth.uid();
 detail=r.schedule_date::text||' · '||(r.start_minute/60)::text||':'||lpad((r.start_minute%60)::text,2,'0')||'–'||(r.end_minute/60)::text||':'||lpad((r.end_minute%60)::text,2,'0')||' · '||r.reason||case when r.notes<>'' then ' · '||r.notes else '' end;
 if tg_op='UPDATE' then
 previous=(old.start_minute/60)::text||':'||lpad((old.start_minute%60)::text,2,'0')||'–'||(old.end_minute/60)::text||':'||lpad((old.end_minute%60)::text,2,'0')||' · '||old.reason||case when old.notes<>'' then ' · '||old.notes else '' end;
 detail=detail||' (previously '||previous||')';
 end if;
 insert into public.driver_activity(driver_name,action,details,actor_id,actor_name)
 values(r.driver_name,case tg_op when 'INSERT' then 'Downtime added' when 'UPDATE' then 'Downtime edited' else 'Downtime removed' end,detail,auth.uid(),coalesce(actor,'User'));
 if tg_op='DELETE' then return old;else return new;end if;
end $$;