-- Transfers v18: location management permissions
-- Safe to run more than once.
-- Allows authenticated users to edit or delete the shared location master list.

do $$
begin
  if to_regclass('public.transfer_locations') is null then
    raise exception
      'Transfers database not detected: public.transfer_locations is missing. Open the Supabase project used by the Transfers app before running migration-v18.sql.';
  end if;
end $$;

alter table public.transfer_locations enable row level security;

drop policy if exists "transfer locations read" on public.transfer_locations;
create policy "transfer locations read"
  on public.transfer_locations for select
  to authenticated
  using(true);

drop policy if exists "transfer locations insert" on public.transfer_locations;
create policy "transfer locations insert"
  on public.transfer_locations for insert
  to authenticated
  with check(auth.uid()=created_by);

drop policy if exists "transfer locations update" on public.transfer_locations;
create policy "transfer locations update"
  on public.transfer_locations for update
  to authenticated
  using(true)
  with check(true);

drop policy if exists "transfer locations delete" on public.transfer_locations;
create policy "transfer locations delete"
  on public.transfer_locations for delete
  to authenticated
  using(true);

grant select,insert,update,delete on public.transfer_locations to authenticated;

do $$
begin
  if not exists(
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='transfer_locations'
  ) then
    alter publication supabase_realtime add table public.transfer_locations;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
