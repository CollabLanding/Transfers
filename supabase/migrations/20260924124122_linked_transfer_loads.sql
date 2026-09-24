alter table public.transfers add column linked_next_id uuid references public.transfers(id) on delete set null;
alter table public.transfers add constraint transfers_link_not_self check (linked_next_id is distinct from id);
create unique index transfers_linked_next_unique on public.transfers(linked_next_id) where linked_next_id is not null;

create function public.set_transfer_link(p_source uuid, p_target uuid default null)
returns setof public.transfers language plpgsql security invoker set search_path = '' as $$
declare s public.transfers; next_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to link loads'; end if;
  perform pg_advisory_xact_lock(70428119);
  select * into strict s from public.transfers where id=p_source for update;
  if p_target is not null then
    if s.linked_next_id is not null then raise exception 'Unlink this load first'; end if;
    select q.next_id into next_id from (
      select id, lead(id) over (order by scheduled_time, updated_at, move_number, id) next_id
      from public.transfers where driver=s.driver and scheduled_date=s.scheduled_date
    ) q where q.id=p_source;
    if next_id is distinct from p_target then raise exception 'Drop the chain on the next load below in the same driver column'; end if;
    if exists(select 1 from public.transfers where linked_next_id=p_target) then raise exception 'That load is already linked from above'; end if;
    if exists(with recursive chain(id) as (
      select p_target union select t.linked_next_id from public.transfers t join chain c on t.id=c.id where t.linked_next_id is not null
    ) select 1 from chain where id=p_source) then raise exception 'A link cannot create a loop'; end if;
  end if;
  return query update public.transfers set linked_next_id=p_target, updated_at=now() where id=p_source returning *;
end $$;

create function public.move_linked_transfers(p_anchor uuid, p_driver text, p_time time)
returns setof public.transfers language plpgsql security invoker set search_path = '' as $$
declare anchor public.transfers; ids uuid[]; delta interval;
begin
  if auth.uid() is null then raise exception 'Sign in to move loads'; end if;
  if p_driver is null or length(trim(p_driver))=0 or p_time is null then raise exception 'Choose a driver and time'; end if;
  perform pg_advisory_xact_lock(70428119);
  select * into strict anchor from public.transfers where id=p_anchor for update;
  with recursive edges(a,b) as (
    select id,linked_next_id from public.transfers where linked_next_id is not null
    union all select linked_next_id,id from public.transfers where linked_next_id is not null
  ), members(id) as (select p_anchor union select e.b from edges e join members m on e.a=m.id)
  select array_agg(id) into ids from members;
  perform id from public.transfers where id=any(ids) order by id for update;
  delta := p_time-anchor.scheduled_time;
  if exists(select 1 from public.transfers where id=any(ids) and (
    extract(epoch from scheduled_time)+extract(epoch from delta) < 210*60 or
    extract(epoch from scheduled_time)+extract(epoch from delta)+duration_minutes*60 > 1320*60
  )) then raise exception 'The linked loads must all fit within the board hours'; end if;
  return query update public.transfers set driver=p_driver, scheduled_date=anchor.scheduled_date,
    scheduled_time=scheduled_time+delta, updated_at=now() where id=any(ids) returning *;
end $$;
revoke all on function public.set_transfer_link(uuid,uuid) from public, anon;
revoke all on function public.move_linked_transfers(uuid,text,time) from public, anon;
grant execute on function public.set_transfer_link(uuid,uuid) to authenticated;
grant execute on function public.move_linked_transfers(uuid,text,time) to authenticated;
