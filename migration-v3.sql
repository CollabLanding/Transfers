alter table public.transfers
add column if not exists order_status text not null default 'Loading';
select pg_notify('pgrst', 'reload schema');
