-- Transfers v5: persistent Move numbers
-- Safe to run more than once.

create sequence if not exists public.transfer_move_number_seq
  as bigint
  start with 1
  increment by 1;

alter table public.transfers
  add column if not exists move_number bigint;

with base as (
  select coalesce(max(move_number),0)::bigint as max_number
  from public.transfers
  where move_number is not null
),
numbered as (
  select
    id,
    row_number() over(order by created_at, id)::bigint as rn
  from public.transfers
  where move_number is null
)
update public.transfers t
set move_number = base.max_number + numbered.rn
from base, numbered
where t.id = numbered.id;

do $$
declare
  v_max bigint;
begin
  select max(move_number) into v_max from public.transfers;

  if v_max is null then
    perform setval('public.transfer_move_number_seq',1,false);
  else
    perform setval('public.transfer_move_number_seq',v_max,true);
  end if;
end $$;

alter table public.transfers
  alter column move_number
  set default nextval('public.transfer_move_number_seq');

alter sequence public.transfer_move_number_seq
  owned by public.transfers.move_number;

alter table public.transfers
  alter column move_number set not null;

create unique index if not exists transfers_move_number_key
  on public.transfers(move_number);

select pg_notify('pgrst', 'reload schema');
