-- Transfers v2 migration
-- Adds load duration plus shared driver/location dropdown tables.
-- Safe to run more than once.

alter table public.transfers
  add column if not exists duration_minutes int not null default 60;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transfers_duration_minutes_check'
      and conrelid = 'public.transfers'::regclass
  ) then
    alter table public.transfers
      add constraint transfers_duration_minutes_check
      check (duration_minutes between 15 and 720);
  end if;
end $$;

create table if not exists public.transfer_drivers (
  name text primary key,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'System',
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_locations (
  name text primary key,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default 'System',
  created_at timestamptz not null default now()
);

insert into public.transfer_locations(name, created_by_name)
values ('Building 100','System'), ('Building 200','System')
on conflict(name) do nothing;

alter table public.transfer_drivers enable row level security;
alter table public.transfer_locations enable row level security;

drop policy if exists "transfer drivers read" on public.transfer_drivers;
create policy "transfer drivers read"
on public.transfer_drivers for select
to authenticated
using (true);

drop policy if exists "transfer drivers insert" on public.transfer_drivers;
create policy "transfer drivers insert"
on public.transfer_drivers for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "transfer locations read" on public.transfer_locations;
create policy "transfer locations read"
on public.transfer_locations for select
to authenticated
using (true);

drop policy if exists "transfer locations insert" on public.transfer_locations;
create policy "transfer locations insert"
on public.transfer_locations for insert
to authenticated
with check (auth.uid() = created_by);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='transfer_drivers'
  ) then
    alter publication supabase_realtime add table public.transfer_drivers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='transfer_locations'
  ) then
    alter publication supabase_realtime add table public.transfer_locations;
  end if;
end $$;

-- Tell PostgREST/Supabase to refresh its schema cache immediately.
notify pgrst, 'reload schema';
