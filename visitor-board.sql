create schema visitor_private;
create table visitor_private.board_visitor_links(
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 label text not null default 'Visitor board',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table visitor_private.board_visitor_links enable row level security;
revoke all on visitor_private.board_visitor_links from public,anon,authenticated;
create function visitor_private.read_visitor_board(p_token text,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_token is null or length(p_token)<>64 or not exists(select 1 from visitor_private.board_visitor_links where active and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then raise exception 'This visitor link is invalid or has been disabled.' using errcode='42501';end if;
 if p_date is null or p_date not between date '2020-01-01' and date '2100-12-31' then raise exception 'Choose a valid date';end if;
 return jsonb_build_object(
 'date',p_date,
 'drivers',(select coalesce(jsonb_agg(name order by sort_order nulls last,name),'[]') from public.transfer_drivers),
 'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by scheduled_time,move_number),'[]') from (
 select id,scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,pallet_count,job_number,order_status,move_number,urgent,dock_number,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time from public.transfers where scheduled_date=p_date)t),
 'schedules',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select driver_name,schedule_date,start_time,end_time from public.driver_schedules where schedule_date between p_date-1 and p_date)s),
 'statuses',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select id,scheduled_date,driver,start_minutes,end_minutes,status,custom_title,notes from public.transfer_slot_statuses where scheduled_date=p_date)s)
 );
end $$;
revoke all on function visitor_private.read_visitor_board(text,date) from public;
grant usage on schema visitor_private to anon;
grant execute on function visitor_private.read_visitor_board(text,date) to anon,authenticated;
create function public.get_visitor_transfer_board(p_token text,p_date date) returns jsonb
language sql security invoker set search_path='' as $$select visitor_private.read_visitor_board(p_token,p_date)$$;
revoke all on function public.get_visitor_transfer_board(text,date) from public;
grant execute on function public.get_visitor_transfer_board(text,date) to anon,authenticated;
