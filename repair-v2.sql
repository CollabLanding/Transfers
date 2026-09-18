-- Transfers v2 minimal repair
-- Run this in the SAME Supabase project used by live-dock-board.
-- Project reference: wcbmyrtpmrwstbmkeqjt
-- This script intentionally avoids Realtime publication changes and other optional setup.

alter table if exists public.transfers
  add column if not exists duration_minutes integer not null default 60;

create table if not exists public.transfer_drivers (
  name text primary key,
  created_by uuid,
  created_by_name text not null default 'System',
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_locations (
  name text primary key,
  created_by uuid,
  created_by_name text not null default 'System',
  created_at timestamptz not null default now()
);

insert into public.transfer_locations (name, created_by_name)
values
  ('Building 100', 'System'),
  ('Building 200', 'System')
on conflict (name) do nothing;

alter table public.transfer_drivers enable row level security;
alter table public.transfer_locations enable row level security;

drop policy if exists "transfer drivers read" on public.transfer_drivers;
drop policy if exists "transfer drivers insert" on public.transfer_drivers;
drop policy if exists "transfer locations read" on public.transfer_locations;
drop policy if exists "transfer locations insert" on public.transfer_locations;

create policy "transfer drivers read"
on public.transfer_drivers
for select
to authenticated
using (true);

create policy "transfer drivers insert"
on public.transfer_drivers
for insert
to authenticated
with check (auth.uid() = created_by);

create policy "transfer locations read"
on public.transfer_locations
for select
to authenticated
using (true);

create policy "transfer locations insert"
on public.transfer_locations
for insert
to authenticated
with check (auth.uid() = created_by);

grant usage on schema public to authenticated;
grant select, insert on public.transfer_drivers to authenticated;
grant select, insert on public.transfer_locations to authenticated;

-- Force Supabase/PostgREST to refresh the public schema cache.
select pg_notify('pgrst', 'reload schema');

-- Verification: all three values below should be non-null after this runs.
select
  to_regclass('public.transfers') as transfers,
  to_regclass('public.transfer_drivers') as transfer_drivers,
  to_regclass('public.transfer_locations') as transfer_locations;
