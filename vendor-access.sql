
alter table transfers_private.user_access drop constraint user_access_role_check;
alter table transfers_private.user_access add constraint user_access_role_check check(role in ('Owner','Admin','User','Vendor'));
alter table transfers_private.user_access alter column role set default 'Vendor';
create or replace function transfers_private.register_user_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into transfers_private.user_access(user_id,role) values(new.id,'Vendor') on conflict do nothing;
 return new;
end $$;
create or replace function transfers_private.current_access_role() returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select role from transfers_private.user_access where user_id=(select auth.uid())),'Vendor');
$$;
create or replace function transfers_private.set_access_role(p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 if not transfers_private.access_is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 if p_role not in ('User','Admin','Vendor') or p_role is null then raise exception 'Choose Vendor, User, or Admin';end if;
 select role into v_role from transfers_private.user_access where user_id=p_user_id for update;
 if not found then raise exception 'User not found';end if;
 if v_role='Owner' then raise exception 'The Owner role is protected' using errcode='42501';end if;
 if p_user_id=auth.uid() then raise exception 'Ask another administrator to change your role';end if;
 update transfers_private.user_access set role=p_role,updated_at=now(),updated_by=auth.uid() where user_id=p_user_id;
end $$;
create policy "Vendors cannot read loads" on public.transfers as restrictive for select to authenticated using ((select transfers_private.current_access_role())<>'Vendor');
create policy "Vendors create through build endpoint" on public.transfers as restrictive for insert to authenticated with check ((select transfers_private.current_access_role())<>'Vendor');
create policy "Vendors cannot edit loads" on public.transfers as restrictive for update to authenticated using ((select transfers_private.current_access_role())<>'Vendor') with check ((select transfers_private.current_access_role())<>'Vendor');
create policy "Vendors cannot delete loads" on public.transfers as restrictive for delete to authenticated using ((select transfers_private.current_access_role())<>'Vendor');
do $$declare t text;begin
 foreach t in array array['transfer_slot_statuses','board_box_links','driver_schedules'] loop
 execute format('create policy "No Vendor board access" on public.%I as restrictive for all to authenticated using ((select transfers_private.current_access_role())<>''Vendor'') with check ((select transfers_private.current_access_role())<>''Vendor'')',t);
 end loop;
end $$;
create policy "Vendor own profile only" on public.profiles as restrictive for select to authenticated using ((select transfers_private.current_access_role())<>'Vendor' or id=(select auth.uid()));
create function transfers_private.build_vendor_transfer(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();v_name text;v_move bigint;
 v_date date;v_time time;v_duration integer;v_pallets integer;
 v_driver text;v_origin text;v_destination text;v_job text;v_status text;
begin
 if v_actor is null or transfers_private.current_access_role()<>'Vendor' then raise exception 'Vendor access required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Complete all fields';end if;
 v_date:=(p_data->>'scheduled_date')::date;
 v_time:=(p_data->>'scheduled_time')::time;
 v_duration:=(p_data->>'duration_minutes')::integer;
 v_pallets:=(p_data->>'pallet_count')::integer;
 v_driver:=trim(p_data->>'driver');v_origin:=trim(p_data->>'origin');v_destination:=trim(p_data->>'destination');
 v_job:=trim(p_data->>'job_number');v_status:=coalesce(nullif(p_data->>'order_status',''),'Planned');
 if v_date is null or v_time is null or v_driver is null or v_origin is null or v_destination is null or v_job is null or v_job='' then raise exception 'Complete all fields';end if;
 if v_time<'04:00'::time or v_time>'20:00'::time then raise exception 'Scheduled time must be between 4:00 AM and 8:00 PM';end if;
 if v_duration is null or v_duration<15 or v_duration>720 or v_duration%15<>0 then raise exception 'Choose a valid load duration';end if;
 if v_pallets is null or v_pallets<0 or v_pallets>999 then raise exception 'Choose a valid pallet count';end if;
 if lower(v_origin)=lower(v_destination) then raise exception 'Origination and destination must be different';end if;
 if not exists(select 1 from public.transfer_drivers where name=v_driver) then raise exception 'Choose an existing driver';end if;
 if not exists(select 1 from public.transfer_locations where name=v_origin) or not exists(select 1 from public.transfer_locations where name=v_destination) then raise exception 'Choose existing locations';end if;
 if v_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered') then raise exception 'Choose a valid status';end if;
 select display_name into v_name from public.profiles where id=v_actor;
 insert into public.transfers(scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,pallet_count,job_number,order_status,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,created_by,created_by_name)
 values(v_date,v_time,v_duration,v_driver,v_origin,v_destination,v_pallets,v_job,v_status,coalesce((p_data->>'urgent')::boolean,false),nullif(p_data->>'pickup_by_date','')::date,nullif(p_data->>'pickup_by_time','')::time,nullif(p_data->>'deliver_by_date','')::date,nullif(p_data->>'deliver_by_time','')::time,v_actor,coalesce(nullif(v_name,''),'Vendor'))
 returning move_number into v_move;
 return jsonb_build_object('move_number',v_move,'scheduled_date',v_date);
end $$;
create function public.build_vendor_transfer(p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select transfers_private.build_vendor_transfer(p_data);$$;
revoke all on function transfers_private.build_vendor_transfer(jsonb),public.build_vendor_transfer(jsonb) from public,anon;
grant execute on function transfers_private.build_vendor_transfer(jsonb),public.build_vendor_transfer(jsonb) to authenticated;
