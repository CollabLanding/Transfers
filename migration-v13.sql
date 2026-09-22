-- Transfers v13: owner-only Team Chat clearing
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
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email','')) <> 'psaverchenko@collectfanatics.com' then
    raise exception 'Not authorized to clear Team Chat';
  end if;

  delete from public.transfer_chat_messages;
end;
$$;

revoke all on function public.clear_transfer_chat() from public;
grant execute on function public.clear_transfer_chat() to authenticated;

select pg_notify('pgrst', 'reload schema');
