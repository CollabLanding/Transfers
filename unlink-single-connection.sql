create or replace function public.unlink_board_box_connection(p_source text,p_target text) returns void language plpgsql set search_path='' as $$
declare s public.board_link_nodes;t public.board_link_nodes;
begin
 if auth.uid() is null or not transfers_private.has_permission('link_boxes') then raise exception 'Not allowed to unlink boxes'; end if;
 perform pg_advisory_xact_lock(70428119);
 select * into strict s from public.board_link_nodes where box_key=p_source;
 select * into strict t from public.board_link_nodes where box_key=p_target;
 delete from public.board_box_links where source_key=p_source and target_key=p_target;
 if s.kind='job' and t.kind='job' then update public.transfers set linked_next_id=null where id=s.id and linked_next_id=t.id; end if;
end $$;
revoke all on function public.unlink_board_box_connection(text,text) from public,anon;
grant execute on function public.unlink_board_box_connection(text,text) to authenticated;
create or replace function public.set_board_box_link(p_source text,p_target text default null) returns void language plpgsql set search_path='' as $$
declare s public.board_link_nodes;t public.board_link_nodes;edge public.board_box_links;
begin
 if auth.uid() is null or not transfers_private.has_permission('link_boxes') then raise exception 'Not allowed to link boxes'; end if;
 perform pg_advisory_xact_lock(70428119);
 select * into strict s from public.board_link_nodes where box_key=p_source;
 if p_target is null then
  select * into edge from public.board_box_links where source_key=p_source or target_key=p_source order by (source_key=p_source) desc,id limit 1;
  if found then perform public.unlink_board_box_connection(edge.source_key,edge.target_key);
  elsif s.kind='job' then update public.transfers set linked_next_id=null where id=s.id; end if;
  return;
 end if;
 select * into strict t from public.board_link_nodes where box_key=p_target;
 if s.driver<>t.driver or s.scheduled_date<>t.scheduled_date then raise exception 'Link boxes in the same driver column and day'; end if;
 if exists(select 1 from public.board_link_group(p_source) where box_key=p_target) then raise exception 'These boxes are already connected'; end if;
 insert into public.board_box_links(source_job,source_status,target_job,target_status) values(case when s.kind='job' then s.id end,case when s.kind='status' then s.id end,case when t.kind='job' then t.id end,case when t.kind='status' then t.id end);
end $$;