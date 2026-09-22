-- Transfers v14: fix Team Chat clear-all for safe-update databases
-- Safe to run more than once.

do $$
begin
  if to_regclass('public.transfer_chat_messages') is null then
    raise exception
      'Transfers Team Chat not detected: public.transfer_chat_messages is missing. Run migration-v8.sql first.';
  end if;
end $$;

create or replace function public.clear_transfer_chat()
returns void
language plpgsql
security definer
set search_path = public
as $clear_chat$
begin
  if lower(coalesce(auth.jwt() ->> 'email','')) <> 'psaverchenko@collectfanatics.com' then
    raise exception 'Not authorized to clear Team Chat';
  end if;

  delete from public.transfer_chat_messages
  where id is not null;
end;
$clear_chat$;

revoke all on function public.clear_transfer_chat() from public;
grant execute on function public.clear_transfer_chat() to authenticated;

select pg_notify('pgrst', 'reload schema');
