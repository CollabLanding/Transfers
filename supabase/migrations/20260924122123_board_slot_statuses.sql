create table public.transfer_slot_statuses (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  driver text not null check (length(trim(driver)) > 0),
  start_minutes integer not null,
  end_minutes integer not null,
  status text not null check (status in ('Driving', 'Yard Moves', 'Loading')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (start_minutes >= 210 and end_minutes <= 1320 and end_minutes - start_minutes >= 30 and start_minutes % 15 = 0 and end_minutes % 15 = 0)
);
create index transfer_slot_statuses_date_driver_idx on public.transfer_slot_statuses(scheduled_date, driver);
create index transfer_slot_statuses_created_by_idx on public.transfer_slot_statuses(created_by);
alter table public.transfer_slot_statuses enable row level security;
revoke all on public.transfer_slot_statuses from anon, authenticated;
grant select, insert, delete on public.transfer_slot_statuses to authenticated;
create policy "Team can read slot statuses" on public.transfer_slot_statuses for select to authenticated using (true);
create policy "Team can assign slot statuses" on public.transfer_slot_statuses for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Team can delete slot statuses" on public.transfer_slot_statuses for delete to authenticated using (true);
alter publication supabase_realtime add table public.transfer_slot_statuses;
