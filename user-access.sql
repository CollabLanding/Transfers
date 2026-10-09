
create table transfers_private.user_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'User' check(role in ('Owner','Admin','User')),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
alter table transfers_private.user_access enable row level security;
revoke all on transfers_private.user_access from public,anon,authenticated;
insert into transfers_private.user_access(user_id,role)
select id,case when lower(email)='psaverchenko@collectfanatics.com' then 'Owner' else 'User' end from auth.users;
do $$ begin
 if not exists(select 1 from transfers_private.user_access where role='Owner') then raise exception 'Owner account not found';end if;
end $$;
create function transfers_private.current_access_role() returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select role from transfers_private.user_access where user_id=(select auth.uid())),'User');
$$;
create function transfers_private.access_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and transfers_private.current_access_role() in ('Owner','Admin');
$$;
create function transfers_private.register_user_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into transfers_private.user_access(user_id,role) values(new.id,'User') on conflict do nothing;
 return new;
end $$;
create trigger register_transfer_user_access after insert on auth.users
for each row execute function transfers_private.register_user_access();
create function public.get_transfer_access_role() returns text
language sql stable security invoker set search_path='' as $$
 select case when auth.uid() is null then null else transfers_private.current_access_role() end;
$$;
create function transfers_private.list_access_users() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not transfers_private.access_is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'display_name',p.display_name,'role',a.role) order by lower(u.email)),'[]'::jsonb)
 from transfers_private.user_access a join auth.users u on u.id=a.user_id left join public.profiles p on p.id=u.id);
end $$;
create function public.list_transfer_users() returns jsonb
language sql security invoker set search_path='' as $$ select transfers_private.list_access_users(); $$;
create function transfers_private.set_access_role(p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 if not transfers_private.access_is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 if p_role not in ('User','Admin') or p_role is null then raise exception 'Choose User or Admin';end if;
 select role into v_role from transfers_private.user_access where user_id=p_user_id for update;
 if not found then raise exception 'User not found';end if;
 if v_role='Owner' then raise exception 'The Owner role is protected' using errcode='42501';end if;
 if p_user_id=auth.uid() then raise exception 'Ask another administrator to change your role';end if;
 update transfers_private.user_access set role=p_role,updated_at=now(),updated_by=auth.uid() where user_id=p_user_id;
end $$;
create function public.set_transfer_user_role(p_user_id uuid,p_role text) returns void
language sql security invoker set search_path='' as $$ select transfers_private.set_access_role(p_user_id,p_role); $$;
create function transfers_private.board_options() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 return jsonb_build_object(
 'drivers',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'sort_order',sort_order) order by sort_order,name),'[]'::jsonb) from public.transfer_drivers),
 'locations',(select coalesce(jsonb_agg(jsonb_build_object('name',name) order by name),'[]'::jsonb) from public.transfer_locations));
end $$;
create function public.get_transfer_board_options() returns jsonb
language sql stable security invoker set search_path='' as $$ select transfers_private.board_options(); $$;
grant usage on schema transfers_private to authenticated;
revoke all on function transfers_private.current_access_role(),transfers_private.access_is_admin(),transfers_private.register_user_access(),transfers_private.list_access_users(),transfers_private.set_access_role(uuid,text),transfers_private.board_options() from public,anon,authenticated;
grant execute on function transfers_private.current_access_role(),transfers_private.access_is_admin(),transfers_private.list_access_users(),transfers_private.set_access_role(uuid,text),transfers_private.board_options() to authenticated;
revoke all on function public.get_transfer_access_role(),public.list_transfer_users(),public.set_transfer_user_role(uuid,text),public.get_transfer_board_options() from public,anon;
grant execute on function public.get_transfer_access_role(),public.list_transfer_users(),public.set_transfer_user_role(uuid,text),public.get_transfer_board_options() to authenticated;

-- Restrictive policies intersect with existing team/actor policies.
do $$
declare t text;
begin
 foreach t in array array['transfer_drivers','transfer_locations','transfer_activity','driver_activity','transfer_chat_messages','transfer_sms_log','summary_deleted_records'] loop
 execute format('create policy "Admin access gate" on public.%I as restrictive for all to authenticated using ((select transfers_private.access_is_admin())) with check ((select transfers_private.access_is_admin()))',t);
 end loop;
 foreach t in array array['driver_schedules'] loop
 execute format('create policy "Admin insert gate" on public.%I as restrictive for insert to authenticated with check ((select transfers_private.access_is_admin()))',t);
 execute format('create policy "Admin update gate" on public.%I as restrictive for update to authenticated using ((select transfers_private.access_is_admin())) with check ((select transfers_private.access_is_admin()))',t);
 execute format('create policy "Admin delete gate" on public.%I as restrictive for delete to authenticated using ((select transfers_private.access_is_admin()))',t);
 end loop;
end $$;
create or replace function public.reorder_transfer_drivers(p_names text[]) returns void
language plpgsql security invoker set search_path='' as $$
declare v_name text;v_pos integer:=0;
begin
 if not transfers_private.access_is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 foreach v_name in array p_names loop
 update public.transfer_drivers set sort_order=v_pos where name=v_name;
 v_pos:=v_pos+1;
 end loop;
end $$;
create or replace function public.clear_transfer_chat() returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not transfers_private.access_is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 delete from public.transfer_chat_messages where id is not null;
end $$;
grant delete on public.transfer_chat_messages to authenticated;
create policy "Admins clear chat" on public.transfer_chat_messages for delete to authenticated using ((select transfers_private.access_is_admin()));
revoke all on function public.reorder_transfer_drivers(text[]),public.clear_transfer_chat() from public,anon;
grant execute on function public.reorder_transfer_drivers(text[]),public.clear_transfer_chat() to authenticated;

create policy "No direct role table access" on transfers_private.user_access for all to authenticated using(false) with check(false);
revoke execute on function public.handle_new_user(),public.log_transfer_activity() from public,anon,authenticated;
