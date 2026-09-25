-- Typed foreign keys preserve links and clean them up when either box is deleted.
create table public.board_box_links (
 id uuid primary key default gen_random_uuid(),
 source_job uuid references public.transfers(id) on delete cascade,
 source_status uuid references public.transfer_slot_statuses(id) on delete cascade,
 target_job uuid references public.transfers(id) on delete cascade,
 target_status uuid references public.transfer_slot_statuses(id) on delete cascade,
 source_key text generated always as (coalesce('job:'||source_job::text,'status:'||source_status::text)) stored,
 target_key text generated always as (coalesce('job:'||target_job::text,'status:'||target_status::text)) stored,
 check (num_nonnulls(source_job,source_status)=1),
 check (num_nonnulls(target_job,target_status)=1),
 check (source_key<>target_key)
);
create unique index board_box_links_pair on public.board_box_links(least(source_key,target_key),greatest(source_key,target_key));
create index board_box_links_source_job on public.board_box_links(source_job);
create index board_box_links_target_job on public.board_box_links(target_job);
create index board_box_links_source_status on public.board_box_links(source_status);
create index board_box_links_target_status on public.board_box_links(target_status);
alter table public.board_box_links enable row level security;
revoke all on public.board_box_links from anon,authenticated;
grant select,insert,delete on public.board_box_links to authenticated;
create policy "Team reads board links" on public.board_box_links for select to authenticated using (true);
create policy "Team creates board links" on public.board_box_links for insert to authenticated with check (true);
create policy "Team removes board links" on public.board_box_links for delete to authenticated using (true);
insert into public.board_box_links(source_job,target_job) select id,linked_next_id from public.transfers where linked_next_id is not null on conflict do nothing;
alter publication supabase_realtime add table public.board_box_links;

create view public.board_link_nodes with (security_invoker=true) as
 select 'job:'||id::text as box_key,id,'job'::text as kind,driver,scheduled_date,
 (extract(epoch from scheduled_time)/60)::integer as start_minutes,
 (extract(epoch from scheduled_time)/60)::integer+duration_minutes as end_minutes from public.transfers
 union all select 'status:'||id::text,id,'status',driver,scheduled_date,start_minutes,end_minutes from public.transfer_slot_statuses;
revoke all on public.board_link_nodes from anon,authenticated;
grant select on public.board_link_nodes to authenticated;

create function public.board_link_group(p_key text) returns table(box_key text)
language sql stable security invoker set search_path='' as $$
 with recursive edges(a,b) as (
  select source_key,target_key from public.board_box_links union all select target_key,source_key from public.board_box_links
 ), members(k) as (select p_key union select e.b from edges e join members m on e.a=m.k)
 select k from members;
$$;

create function public.set_board_box_link(p_source text,p_target text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.board_link_nodes; t public.board_link_nodes;
begin
 if auth.uid() is null then raise exception 'Sign in to link boxes'; end if;
 perform pg_advisory_xact_lock(70428119);
 select * into strict s from public.board_link_nodes where box_key=p_source;
 if p_target is null then
  delete from public.board_box_links where source_key=p_source or target_key=p_source;
  if s.kind='job' then update public.transfers set linked_next_id=null where id=s.id or linked_next_id=s.id; end if;
  return;
 end if;
 select * into strict t from public.board_link_nodes where box_key=p_target;
 if s.driver<>t.driver or s.scheduled_date<>t.scheduled_date then raise exception 'Link boxes in the same driver column and day'; end if;
 if exists(select 1 from public.board_link_group(p_source) where box_key=p_target) then raise exception 'These boxes are already connected'; end if;
 insert into public.board_box_links(source_job,source_status,target_job,target_status)
 values(case when s.kind='job' then s.id end,case when s.kind='status' then s.id end,
 case when t.kind='job' then t.id end,case when t.kind='status' then t.id end);
end $$;

create function public.move_board_link_group(p_anchor text,p_driver text,p_start integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare anchor public.board_link_nodes; keys text[]; delta integer;
begin
 if auth.uid() is null then raise exception 'Sign in to move boxes'; end if;
 if p_driver is null or length(trim(p_driver))=0 or p_start is null or p_start%15<>0 then raise exception 'Choose a driver and a 15-minute time slot'; end if;
 perform pg_advisory_xact_lock(70428119);
 select * into strict anchor from public.board_link_nodes where box_key=p_anchor;
 select array_agg(box_key) into keys from public.board_link_group(p_anchor);
 perform id from public.transfers where 'job:'||id::text=any(keys) order by id for update;
 perform id from public.transfer_slot_statuses where 'status:'||id::text=any(keys) order by id for update;
 -- Re-read after locks so the relative offset uses current data.
 select * into strict anchor from public.board_link_nodes where box_key=p_anchor;
 delta:=p_start-anchor.start_minutes;
 if exists(select 1 from public.board_link_nodes where box_key=any(keys) and (start_minutes+delta<210 or end_minutes+delta>1320)) then
  raise exception 'All linked boxes must fit within the board hours';
 end if;
 if exists(select 1 from public.transfer_slot_statuses m join public.transfer_slot_statuses o
  on o.driver=p_driver and o.scheduled_date=anchor.scheduled_date and not ('status:'||o.id::text=any(keys))
  and m.start_minutes+delta<o.end_minutes and m.end_minutes+delta>o.start_minutes
  where 'status:'||m.id::text=any(keys)) then raise exception 'A linked status would overlap another status'; end if;
 update public.transfers set driver=p_driver,scheduled_date=anchor.scheduled_date,
 scheduled_time=scheduled_time+make_interval(mins=>delta),updated_at=now() where 'job:'||id::text=any(keys);
 update public.transfer_slot_statuses set driver=p_driver,scheduled_date=anchor.scheduled_date,
 start_minutes=start_minutes+delta,end_minutes=end_minutes+delta where 'status:'||id::text=any(keys);
 return jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(t)) from public.transfers t where 'job:'||t.id::text=any(keys)),'[]'::jsonb),
 'statuses',coalesce((select jsonb_agg(to_jsonb(t)) from public.transfer_slot_statuses t where 'status:'||t.id::text=any(keys)),'[]'::jsonb));
end $$;

-- Older tabs use the same authoritative graph until refreshed.
create or replace function public.set_transfer_link(p_source uuid,p_target uuid default null)
returns setof public.transfers language plpgsql security invoker set search_path='' as $$
begin
 perform public.set_board_box_link('job:'||p_source::text,case when p_target is not null then 'job:'||p_target::text end);
 return query select * from public.transfers where id=p_source;
end $$;
create or replace function public.move_linked_transfers(p_anchor uuid,p_driver text,p_time time)
returns setof public.transfers language plpgsql security invoker set search_path='' as $$
begin
 perform public.move_board_link_group('job:'||p_anchor::text,p_driver,(extract(epoch from p_time)/60)::integer);
 return query select t.* from public.transfers t join public.board_link_group('job:'||p_anchor::text) g on g.box_key='job:'||t.id::text;
end $$;
revoke all on function public.board_link_group(text) from public,anon;
revoke all on function public.set_board_box_link(text,text) from public,anon;
revoke all on function public.move_board_link_group(text,text,integer) from public,anon;
grant execute on function public.board_link_group(text),public.set_board_box_link(text,text),public.move_board_link_group(text,text,integer) to authenticated;
