-- Transfers v12: urgent transfer flag
-- Safe to run more than once.

do $$
begin
  if to_regclass('public.transfers') is null then
    raise exception
      'Transfers database not detected: public.transfers is missing. Open the Supabase project used by the Transfers app before running migration-v12.sql.';
  end if;
end $$;

alter table public.transfers
  add column if not exists urgent boolean not null default false;
