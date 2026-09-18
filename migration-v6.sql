-- Transfers v6: add Planned order status
-- Safe to run more than once.

alter table public.transfers
  add column if not exists order_status text not null default 'Loading';

alter table public.transfers
  drop constraint if exists transfers_order_status_check;

alter table public.transfers
  add constraint transfers_order_status_check
  check (order_status in ('Planned','Loading','Loaded','In Transit','Delivered'));

select pg_notify('pgrst', 'reload schema');
