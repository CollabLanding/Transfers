create table public.driver_invoice_marks (
 driver_name text not null references public.transfer_drivers(name) on update cascade on delete cascade,
 schedule_date date not null,
 is_invoiced boolean not null default false,
 source text not null default 'Manual' check(source in ('Manual','Invoice')),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(driver_name,schedule_date)
);
alter table public.driver_invoice_marks enable row level security;
grant select,insert,update on public.driver_invoice_marks to authenticated;
create policy invoice_marks_read on public.driver_invoice_marks for select to authenticated using ((select transfers_private.has_any_permission(array['driver_schedules','copy_schedules','driver_profiles','driver_phones','repeat_schedules','driver_reports','driver_activity'])));
create policy invoice_marks_insert on public.driver_invoice_marks for insert to authenticated with check ((select transfers_private.has_any_permission(array['driver_schedules','driver_reports'])));
create policy invoice_marks_update on public.driver_invoice_marks for update to authenticated using ((select transfers_private.has_any_permission(array['driver_schedules','driver_reports']))) with check ((select transfers_private.has_any_permission(array['driver_schedules','driver_reports'])));
create function transfers_private.stamp_driver_invoice_mark() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 new.updated_by=auth.uid();new.updated_at=clock_timestamp();
 return new;
end $$;
create trigger stamp_driver_invoice_mark before insert or update on public.driver_invoice_marks for each row execute function transfers_private.stamp_driver_invoice_mark();
create function transfers_private.audit_driver_invoice_mark() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.is_invoiced=new.is_invoiced then return new; end if;
 insert into public.driver_activity(driver_name,action,details,actor_id,actor_name)
 values(new.driver_name,case when new.is_invoiced then 'Marked invoiced' else 'Invoice mark cleared' end,new.schedule_date::text||' · '||new.source,auth.uid(),coalesce(nullif(split_part(auth.jwt()->>'email','@',1),''),'User'));
 return new;
end $$;
create trigger audit_driver_invoice_mark after insert or update on public.driver_invoice_marks for each row execute function transfers_private.audit_driver_invoice_mark();
alter publication supabase_realtime add table public.driver_invoice_marks;

revoke all on public.driver_invoice_marks from anon, public, authenticated; grant select,insert,update on public.driver_invoice_marks to authenticated;
