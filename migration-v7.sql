-- Transfers v7: persistent driver-column ordering
-- Safe to run more than once.

alter table public.transfer_drivers
  add column if not exists sort_order integer not null default 1000000;

with ranked as (
  select name, row_number() over(order by name)::integer - 1 as rn
  from public.transfer_drivers
)
update public.transfer_drivers d
set sort_order = ranked.rn
from ranked
where d.name = ranked.name
  and d.sort_order = 1000000;

create or replace function public.reorder_transfer_drivers(p_names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_pos integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  foreach v_name in array p_names loop
    update public.transfer_drivers
    set sort_order = v_pos
    where name = v_name;
    v_pos := v_pos + 1;
  end loop;
end;
$$;

grant execute on function public.reorder_transfer_drivers(text[]) to authenticated;

select pg_notify('pgrst', 'reload schema');
