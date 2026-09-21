-- Transfers v10: Planning column + two-hour default
-- Safe to run more than once.

alter table public.transfers
  alter column duration_minutes set default 120;

insert into public.transfer_drivers(name,created_by_name,sort_order)
values ('Planning','System',-1)
on conflict(name) do nothing;

select pg_notify('pgrst', 'reload schema');
