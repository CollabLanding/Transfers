create function public.resize_board_link_group(p_anchor text,p_start integer,p_end integer,p_expected_start integer,p_expected_end integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare anchor public.board_link_nodes; keys text[]; delta integer;
begin
 if auth.uid() is null then raise exception 'Sign in to resize boxes';end if;
 if p_start is null or p_end is null or p_start%15<>0 or p_end%15<>0 or p_start<210 or p_end>1320 or p_end<=p_start then raise exception 'Choose a valid 15-minute range within the board hours';end if;
 perform pg_advisory_xact_lock(70428119);
 select * into strict anchor from public.board_link_nodes where box_key=p_anchor;
 perform id from public.transfers where 'job:'||id::text in (select box_key from public.board_link_group(p_anchor)) order by id for update;
 perform id from public.transfer_slot_statuses where 'status:'||id::text in (select box_key from public.board_link_group(p_anchor)) order by id for update;
 select * into strict anchor from public.board_link_nodes where box_key=p_anchor;
 if anchor.start_minutes is distinct from p_expected_start or anchor.end_minutes is distinct from p_expected_end then raise exception 'This box changed while resizing. Try again.';end if;
 if anchor.kind='job' then
  if not transfers_private.has_permission('resize_load') then raise exception 'Resizing loads is not permitted' using errcode='42501';end if;
  if p_end-p_start not between 15 and 720 then raise exception 'Load duration must be between 15 and 720 minutes';end if;
 else
  if not transfers_private.has_permission('manage_status') then raise exception 'Managing statuses is not permitted' using errcode='42501';end if;
  if p_end-p_start<30 then raise exception 'A status must last at least 30 minutes';end if;
 end if;
 with recursive edges(a,b) as (
  select source_key,target_key from public.board_box_links union all select target_key,source_key from public.board_box_links
 ), followers(k) as (
  select p_anchor union
  select e.b from followers f join edges e on e.a=f.k join public.board_link_nodes n on n.box_key=e.b
  where n.start_minutes>anchor.start_minutes and n.driver=anchor.driver and n.scheduled_date=anchor.scheduled_date
 ) select array_agg(k) into keys from followers;
 delta:=p_end-anchor.end_minutes;
 if exists(select 1 from public.board_link_nodes where box_key=any(keys) and box_key<>p_anchor and (start_minutes+delta<210 or end_minutes+delta>1320)) then raise exception 'All linked boxes must fit within the board hours';end if;
 -- Validate every final status range, including the resized anchor.
 if exists(
  with planned as (
   select id,driver,scheduled_date,
    case when box_key=p_anchor then p_start when box_key=any(keys) then start_minutes+delta else start_minutes end s,
    case when box_key=p_anchor then p_end when box_key=any(keys) then end_minutes+delta else end_minutes end e,
    box_key=any(keys) changed
   from public.board_link_nodes where kind='status'
  ) select 1 from planned a join planned b on a.id<b.id and a.driver=b.driver and a.scheduled_date=b.scheduled_date and a.s<b.e and a.e>b.s where a.changed or b.changed
 ) then raise exception 'A linked status would overlap another status';end if;
 update public.transfers set
  scheduled_time=case when 'job:'||id::text=p_anchor then time '00:00'+make_interval(mins=>p_start) else scheduled_time+make_interval(mins=>delta) end,
  duration_minutes=case when 'job:'||id::text=p_anchor then p_end-p_start else duration_minutes end,updated_at=now()
 where 'job:'||id::text=any(keys) and ('job:'||id::text=p_anchor or delta<>0);
 update public.transfer_slot_statuses set
  start_minutes=case when 'status:'||id::text=p_anchor then p_start else start_minutes+delta end,
  end_minutes=case when 'status:'||id::text=p_anchor then p_end else end_minutes+delta end
 where 'status:'||id::text=any(keys) and ('status:'||id::text=p_anchor or delta<>0);
 return jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(t)) from public.transfers t where 'job:'||t.id::text=any(keys)),'[]'::jsonb),
 'statuses',coalesce((select jsonb_agg(to_jsonb(t)) from public.transfer_slot_statuses t where 'status:'||t.id::text=any(keys)),'[]'::jsonb));
end;$$;
revoke all on function public.resize_board_link_group(text,integer,integer,integer,integer) from public,anon;
grant execute on function public.resize_board_link_group(text,integer,integer,integer,integer) to authenticated;
