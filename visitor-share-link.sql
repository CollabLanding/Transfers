alter table visitor_private.board_visitor_links add column token_value text;
create function visitor_private.share_board_link() returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if auth.uid() is null or coalesce(public.get_transfer_access()->>'role','') not in ('Owner','Admin') then raise exception 'Owner or Admin access required' using errcode='42501';end if;
 select 'https://collablanding.github.io/Transfers/visitor.html#key='||token_value into result from visitor_private.board_visitor_links where active and token_value is not null order by created_at limit 1;
 if result is null then raise exception 'No active visitor link is available';end if;
 return result;
end $$;
revoke all on function visitor_private.share_board_link() from public,anon;
grant usage on schema visitor_private to authenticated;
grant execute on function visitor_private.share_board_link() to authenticated;
create function public.get_visitor_board_share_link() returns text language sql security invoker set search_path='' as $$select visitor_private.share_board_link()$$;
revoke all on function public.get_visitor_board_share_link() from public,anon;
grant execute on function public.get_visitor_board_share_link() to authenticated;