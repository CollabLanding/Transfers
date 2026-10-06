do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='transfer_locations' and column_name='contact'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='transfer_locations' and column_name='contact_name'
  ) then
    alter table public.transfer_locations rename column contact to contact_name;
  end if;
end $$;

alter table public.transfer_locations
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists contact_name text,
  add column if not exists contact_number text;