-- Transfers v11: driver weekly scheduling
-- Safe to run more than once.

create table if not exists public.driver_schedules(
  id uuid primary key default gen_random_uuid(),
  driver_name text not null references public.transfer_drivers(name) on update cascade on delete cascade,
  schedule_date date not null,
  start_time time not null,
  end_time time not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text not null default 'User',
  updated_at timestamptz not null default now(),
  unique(driver_name,schedule_date)
);

create index if not exists driver_schedules_date_idx
  on public.driver_schedules(schedule_date);

create index if not exists driver_schedules_driver_date_idx
  on public.driver_schedules(driver_name,schedule_date);

alter table public.driver_schedules enable row level security;

drop policy if exists "driver schedules read" on public.driver_schedules;
create policy "driver schedules read"
  on public.driver_schedules for select
  to authenticated
  using(true);

drop policy if exists "driver schedules insert" on public.driver_schedules;
create policy "driver schedules insert"
  on public.driver_schedules for insert
  to authenticated
  with check(auth.uid()=updated_by);

drop policy if exists "driver schedules update" on public.driver_schedules;
create policy "driver schedules update"
  on public.driver_schedules for update
  to authenticated
  using(true)
  with check(auth.uid()=updated_by);

drop policy if exists "driver schedules delete" on public.driver_schedules;
create policy "driver schedules delete"
  on public.driver_schedules for delete
  to authenticated
  using(true);

grant select,insert,update,delete on public.driver_schedules to authenticated;

do $$
begin
  if not exists(
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='driver_schedules'
  ) then
    alter publication supabase_realtime add table public.driver_schedules;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
