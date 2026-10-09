
create table transfers_private.role_permissions(role text primary key check(role in ('Admin','User','Vendor')),permissions jsonb not null check(jsonb_typeof(permissions)='object'));
create table transfers_private.permission_config(singleton boolean primary key default true check(singleton),revision integer not null default 1,catalog jsonb not null,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id));
alter table transfers_private.role_permissions enable row level security;
alter table transfers_private.permission_config enable row level security;
create policy "No direct permission access" on transfers_private.role_permissions for all to authenticated using(false) with check(false);
create policy "No direct permission config access" on transfers_private.permission_config for all to authenticated using(false) with check(false);
revoke all on transfers_private.role_permissions,transfers_private.permission_config from public,anon,authenticated;
insert into transfers_private.permission_config(singleton,catalog) values(true,'[{"key":"view_board","group":"Transfers","label":"View Transfers board","dependencies":[],"adminOnly":false,"fixed":false},{"key":"board_navigation","group":"Transfers","label":"Change day and view the clock / planning count","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"create_load","group":"Transfers","label":"Build a new transfer load","dependencies":[],"adminOnly":false,"fixed":false},{"key":"load_deadlines","group":"Transfers","label":"Set urgent flag and pickup / delivery deadlines","dependencies":["create_load"],"adminOnly":false,"fixed":false},{"key":"edit_load","group":"Transfers","label":"Edit load details and order status","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"delete_load","group":"Transfers","label":"Delete loads","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"move_load","group":"Transfers","label":"Drag loads between drivers and times","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"resize_load","group":"Transfers","label":"Resize load duration","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"duplicate_load","group":"Transfers","label":"Duplicate a load","dependencies":["view_board","create_load"],"adminOnly":false,"fixed":false},{"key":"duplicate_day","group":"Transfers","label":"Duplicate a day''s loads","dependencies":["view_board","create_load"],"adminOnly":false,"fixed":false},{"key":"create_status","group":"Transfers","label":"Assign time-slot statuses","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"status_notes","group":"Transfers","label":"Edit time-slot notes and custom titles","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"manage_status","group":"Transfers","label":"Move, resize, and delete time-slot boxes","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"link_boxes","group":"Transfers","label":"Link and unlink job / status boxes","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"reorder_drivers","group":"Transfers","label":"Reorder driver columns","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"status_history","group":"Transfers","label":"View status history","dependencies":["edit_load"],"adminOnly":false,"fixed":false},{"key":"edit_status_history","group":"Transfers","label":"Edit status change times","dependencies":["status_history"],"adminOnly":false,"fixed":false},{"key":"send_sms","group":"Transfers","label":"Text drivers","dependencies":["edit_load"],"adminOnly":false,"fixed":false},{"key":"driver_schedules","group":"Drivers","label":"View and edit driver schedules","dependencies":[],"adminOnly":false,"fixed":false},{"key":"copy_schedules","group":"Drivers","label":"Copy schedules by day, week, or month","dependencies":["driver_schedules"],"adminOnly":false,"fixed":false},{"key":"driver_profiles","group":"Drivers","label":"Add drivers and edit driver information","dependencies":[],"adminOnly":false,"fixed":false},{"key":"driver_phones","group":"Drivers","label":"Manage driver phone numbers","dependencies":["driver_profiles"],"adminOnly":false,"fixed":false},{"key":"repeat_schedules","group":"Drivers","label":"Set weekly schedules and automatic monthly repeats","dependencies":["driver_profiles","driver_schedules"],"adminOnly":false,"fixed":false},{"key":"driver_reports","group":"Drivers","label":"Run driver reports and export PDF","dependencies":[],"adminOnly":false,"fixed":false},{"key":"driver_activity","group":"Drivers","label":"View driver activity and overtime indicators","dependencies":[],"adminOnly":false,"fixed":false},{"key":"locations","group":"Locations","label":"View, add, edit, and delete locations","dependencies":[],"adminOnly":false,"fixed":false},{"key":"summary_reports","group":"Summary","label":"Run past-job and status reports","dependencies":[],"adminOnly":false,"fixed":false},{"key":"summary_filters","group":"Summary","label":"Filter by date, driver, type, status, location, and search","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"summary_export","group":"Summary","label":"Export CSV and print reports","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"deleted_records","group":"Summary","label":"View deleted records","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"summary_edit","group":"Summary","label":"Edit record dates and statuses","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"restore_records","group":"Summary","label":"Restore deleted jobs and time-slot statuses","dependencies":["deleted_records","summary_edit"],"adminOnly":false,"fixed":false},{"key":"chat","group":"Communication and access","label":"Use Team Chat and emojis","dependencies":[],"adminOnly":false,"fixed":false},{"key":"clear_chat","group":"Communication and access","label":"Clear Team Chat","dependencies":["chat"],"adminOnly":false,"fixed":false},{"key":"recent_activity","group":"Communication and access","label":"View, search, and open Recent Activity records","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"active_users","group":"Communication and access","label":"View Active Users","dependencies":[],"adminOnly":false,"fixed":false},{"key":"manage_users","group":"Communication and access","label":"Open User Access and assign roles","dependencies":[],"adminOnly":true,"fixed":false},{"key":"view_permissions","group":"Communication and access","label":"View this Permissions grid","dependencies":[],"adminOnly":true,"fixed":false},{"key":"trailer_link","group":"Communication and access","label":"Show Live Trailer Board link","dependencies":[],"adminOnly":false,"fixed":false},{"key":"theme","group":"Communication and access","label":"Switch light / dark theme","dependencies":[],"adminOnly":false,"fixed":false},{"key":"sign_out","group":"Communication and access","label":"Sign out","dependencies":[],"adminOnly":false,"fixed":true}]'::jsonb);
insert into transfers_private.role_permissions(role,permissions) values ('Admin','{"view_board":true,"board_navigation":true,"create_load":true,"load_deadlines":true,"edit_load":true,"delete_load":true,"move_load":true,"resize_load":true,"duplicate_load":true,"duplicate_day":true,"create_status":true,"status_notes":true,"manage_status":true,"link_boxes":true,"reorder_drivers":true,"status_history":true,"edit_status_history":true,"send_sms":true,"driver_schedules":true,"copy_schedules":true,"driver_profiles":true,"driver_phones":true,"repeat_schedules":true,"driver_reports":true,"driver_activity":true,"locations":true,"summary_reports":true,"summary_filters":true,"summary_export":true,"deleted_records":true,"summary_edit":true,"restore_records":true,"chat":true,"clear_chat":true,"recent_activity":true,"active_users":true,"manage_users":true,"view_permissions":true,"trailer_link":true,"theme":true,"sign_out":true}'::jsonb),('User','{"view_board":true,"board_navigation":true,"create_load":true,"load_deadlines":true,"edit_load":true,"delete_load":true,"move_load":true,"resize_load":true,"duplicate_load":true,"duplicate_day":true,"create_status":true,"status_notes":true,"manage_status":true,"link_boxes":true,"reorder_drivers":false,"status_history":false,"edit_status_history":false,"send_sms":false,"driver_schedules":false,"copy_schedules":false,"driver_profiles":false,"driver_phones":false,"repeat_schedules":false,"driver_reports":false,"driver_activity":false,"locations":false,"summary_reports":false,"summary_filters":false,"summary_export":false,"deleted_records":false,"summary_edit":false,"restore_records":false,"chat":false,"clear_chat":false,"recent_activity":false,"active_users":false,"manage_users":false,"view_permissions":false,"trailer_link":false,"theme":true,"sign_out":true}'::jsonb),('Vendor','{"view_board":false,"board_navigation":false,"create_load":true,"load_deadlines":true,"edit_load":false,"delete_load":false,"move_load":false,"resize_load":false,"duplicate_load":false,"duplicate_day":false,"create_status":false,"status_notes":false,"manage_status":false,"link_boxes":false,"reorder_drivers":false,"status_history":false,"edit_status_history":false,"send_sms":false,"driver_schedules":false,"copy_schedules":false,"driver_profiles":false,"driver_phones":false,"repeat_schedules":false,"driver_reports":false,"driver_activity":false,"locations":false,"summary_reports":false,"summary_filters":false,"summary_export":false,"deleted_records":false,"summary_edit":false,"restore_records":false,"chat":false,"clear_chat":false,"recent_activity":false,"active_users":false,"manage_users":false,"view_permissions":false,"trailer_link":false,"theme":false,"sign_out":true}'::jsonb);
create function transfers_private.has_permission(p_feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from transfers_private.permission_config c,jsonb_array_elements(c.catalog)f where f->>'key'=p_feature)
 and (transfers_private.current_access_role()='Owner' or coalesce((select (permissions->>p_feature)::boolean from transfers_private.role_permissions where role=transfers_private.current_access_role()),false));
$$;
create function transfers_private.has_any_permission(p_features text[]) returns boolean
language sql stable security invoker set search_path='' as $$select coalesce(bool_or(transfers_private.has_permission(f)),false) from unnest(p_features)f;$$;
create function transfers_private.my_permissions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p jsonb;r text;v integer;
begin
 if auth.uid() is null then return null;end if;
 r:=transfers_private.current_access_role();
 select revision into v from transfers_private.permission_config;
 if r='Owner' then select jsonb_object_agg(f->>'key',true) into p from transfers_private.permission_config,jsonb_array_elements(catalog)f;
 else select permissions into p from transfers_private.role_permissions where role=r;end if;
 return jsonb_build_object('role',r,'permissions',coalesce(p,'{}'::jsonb),'revision',v);
end $$;
create function public.get_transfer_access() returns jsonb language sql stable security invoker set search_path='' as $$select transfers_private.my_permissions();$$;
create function public.has_transfer_permission(p_feature text) returns boolean language sql stable security invoker set search_path='' as $$select transfers_private.has_permission(p_feature);$$;
create function transfers_private.read_role_permissions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not transfers_private.access_is_admin() or not transfers_private.has_permission('view_permissions') then raise exception 'Permission grid access required' using errcode='42501';end if;
 return (select jsonb_build_object('revision',revision,'catalog',catalog,'roles',(select jsonb_object_agg(role,permissions) from transfers_private.role_permissions)) from transfers_private.permission_config);
end $$;
create function public.get_transfer_role_permissions() returns jsonb language sql stable security invoker set search_path='' as $$select transfers_private.read_role_permissions();$$;
create function transfers_private.save_role_permissions(p_roles jsonb,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare r text;f jsonb;k text;d text;v integer;
begin
 if auth.uid() is null or transfers_private.current_access_role()<>'Owner' then raise exception 'Only the Owner can edit permissions' using errcode='42501';end if;
 select revision into v from transfers_private.permission_config where singleton=true for update;
 if p_revision is distinct from v then raise exception 'Permissions changed since you opened this grid. Close and reopen it before saving.';end if;
 if p_roles is null or jsonb_typeof(p_roles)<>'object' or (select count(*) from jsonb_object_keys(p_roles))<>3 then raise exception 'Provide Admin, User, and Vendor permissions';end if;
 foreach r in array array['Admin','User','Vendor'] loop
 if jsonb_typeof(p_roles->r) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_roles->r))<>(select jsonb_array_length(catalog) from transfers_private.permission_config) then raise exception 'Invalid role permissions';end if;
 for f in select x from transfers_private.permission_config,jsonb_array_elements(catalog)x loop
 k:=f->>'key';
 if jsonb_typeof(p_roles->r->k) is distinct from 'boolean' then raise exception 'Every permission must be checked or unchecked';end if;
 if (f->>'fixed')::boolean and not (p_roles->r->>k)::boolean then raise exception 'Sign out remains available for every role';end if;
 if (f->>'adminOnly')::boolean and r<>'Admin' and (p_roles->r->>k)::boolean then raise exception 'User management and the permissions grid require Admin role';end if;
 if (p_roles->r->>k)::boolean then
 for d in select jsonb_array_elements_text(f->'dependencies') loop
 if not (p_roles->r->>d)::boolean then raise exception 'Permission % requires %',k,d;end if;
 end loop;
 end if;
 end loop;
 update transfers_private.role_permissions set permissions=p_roles->r where role=r;
 end loop;
 update transfers_private.permission_config set revision=revision+1,updated_at=now(),updated_by=auth.uid() where singleton=true;
end $$;
create function public.save_transfer_role_permissions(p_roles jsonb,p_revision integer) returns void language sql security invoker set search_path='' as $$select transfers_private.save_role_permissions(p_roles,p_revision);$$;
revoke all on function transfers_private.has_permission(text),transfers_private.has_any_permission(text[]),transfers_private.my_permissions(),transfers_private.read_role_permissions(),transfers_private.save_role_permissions(jsonb,integer),public.get_transfer_access(),public.has_transfer_permission(text),public.get_transfer_role_permissions(),public.save_transfer_role_permissions(jsonb,integer) from public,anon;
grant execute on function transfers_private.has_permission(text),transfers_private.has_any_permission(text[]),transfers_private.my_permissions(),transfers_private.read_role_permissions(),transfers_private.save_role_permissions(jsonb,integer),public.get_transfer_access(),public.has_transfer_permission(text),public.get_transfer_role_permissions(),public.save_transfer_role_permissions(jsonb,integer) to authenticated;
drop policy "Admin access gate" on public.transfer_drivers;
drop policy "Admin access gate" on public.transfer_locations;
drop policy "Admin access gate" on public.transfer_activity;
drop policy "Admin access gate" on public.driver_activity;
drop policy "Admin access gate" on public.transfer_chat_messages;
drop policy "Admin access gate" on public.transfer_sms_log;
drop policy "Admin access gate" on public.summary_deleted_records;
drop policy "Admin insert gate" on public.driver_schedules;
drop policy "Admin update gate" on public.driver_schedules;
drop policy "Admin delete gate" on public.driver_schedules;
drop policy "Vendors cannot read loads" on public.transfers;
drop policy "Vendors create through build endpoint" on public.transfers;
drop policy "Vendors cannot edit loads" on public.transfers;
drop policy "Vendors cannot delete loads" on public.transfers;
drop policy "No Vendor board access" on public.transfer_slot_statuses;
drop policy "No Vendor board access" on public.board_box_links;
drop policy "No Vendor board access" on public.driver_schedules;
drop policy "Vendor own profile only" on public.profiles;
create policy "Permission select gate" on public.profiles as restrictive for SELECT to authenticated using (id=(select auth.uid()) or (select transfers_private.has_any_permission(array['view_board','active_users','manage_users','recent_activity','summary_reports','driver_schedules','copy_schedules','driver_profiles','driver_phones','repeat_schedules','driver_reports','driver_activity','reorder_drivers','send_sms']))) ;
create policy "Permission select gate" on public.transfers as restrictive for SELECT to authenticated using ((select transfers_private.has_any_permission(array['view_board','summary_reports']))) ;
create policy "Permission insert gate" on public.transfers as restrictive for INSERT to authenticated  with check ((select transfers_private.has_any_permission(array['create_load','duplicate_load','duplicate_day','restore_records'])));
create policy "Permission update gate" on public.transfers as restrictive for UPDATE to authenticated using ((select transfers_private.has_any_permission(array['edit_load','move_load','resize_load','link_boxes','summary_edit']))) with check ((select transfers_private.has_any_permission(array['edit_load','move_load','resize_load','link_boxes','summary_edit'])));
create policy "Permission delete gate" on public.transfers as restrictive for DELETE to authenticated using ((select transfers_private.has_permission('delete_load'))) ;
create policy "Permission select gate" on public.transfer_slot_statuses as restrictive for SELECT to authenticated using ((select transfers_private.has_any_permission(array['view_board','summary_reports']))) ;
create policy "Permission insert gate" on public.transfer_slot_statuses as restrictive for INSERT to authenticated  with check ((select transfers_private.has_any_permission(array['create_status','restore_records'])));
create policy "Permission update gate" on public.transfer_slot_statuses as restrictive for UPDATE to authenticated using ((select transfers_private.has_any_permission(array['status_notes','manage_status','summary_edit']))) with check ((select transfers_private.has_any_permission(array['status_notes','manage_status','summary_edit'])));
create policy "Permission delete gate" on public.transfer_slot_statuses as restrictive for DELETE to authenticated using ((select transfers_private.has_permission('manage_status'))) ;
create policy "Permission select gate" on public.board_box_links as restrictive for SELECT to authenticated using ((select transfers_private.has_permission('view_board'))) ;
create policy "Permission insert gate" on public.board_box_links as restrictive for INSERT to authenticated  with check ((select transfers_private.has_permission('link_boxes')));
create policy "Permission delete gate" on public.board_box_links as restrictive for DELETE to authenticated using ((select transfers_private.has_permission('link_boxes'))) ;
create policy "Permission select gate" on public.transfer_drivers as restrictive for SELECT to authenticated using ((select transfers_private.has_any_permission(array['driver_schedules','copy_schedules','driver_profiles','driver_phones','repeat_schedules','driver_reports','driver_activity','reorder_drivers','send_sms']))) ;
create policy "Permission insert gate" on public.transfer_drivers as restrictive for INSERT to authenticated  with check ((select transfers_private.has_permission('driver_profiles')));
create policy "Permission update gate" on public.transfer_drivers as restrictive for UPDATE to authenticated using ((select transfers_private.has_any_permission(array['driver_profiles','driver_phones','repeat_schedules','reorder_drivers']))) with check ((select transfers_private.has_any_permission(array['driver_profiles','driver_phones','repeat_schedules','reorder_drivers'])));
create policy "Permission all gate" on public.transfer_locations as restrictive for ALL to authenticated using ((select transfers_private.has_permission('locations'))) with check ((select transfers_private.has_permission('locations')));
create policy "Permission select gate" on public.driver_schedules as restrictive for SELECT to authenticated using ((select transfers_private.has_any_permission(array['view_board','driver_schedules','copy_schedules','driver_profiles','driver_phones','repeat_schedules','driver_reports','driver_activity','reorder_drivers','send_sms']))) ;
create policy "Permission insert gate" on public.driver_schedules as restrictive for INSERT to authenticated  with check ((select transfers_private.has_any_permission(array['driver_schedules','copy_schedules','repeat_schedules'])));
create policy "Permission update gate" on public.driver_schedules as restrictive for UPDATE to authenticated using ((select transfers_private.has_any_permission(array['driver_schedules','copy_schedules','repeat_schedules']))) with check ((select transfers_private.has_any_permission(array['driver_schedules','copy_schedules','repeat_schedules'])));
create policy "Permission delete gate" on public.driver_schedules as restrictive for DELETE to authenticated using ((select transfers_private.has_any_permission(array['driver_schedules','copy_schedules','repeat_schedules']))) ;
create policy "Permission select gate" on public.transfer_activity as restrictive for SELECT to authenticated using ((select transfers_private.has_any_permission(array['recent_activity','status_history','edit_status_history']))) ;
create policy "Permission update gate" on public.transfer_activity as restrictive for UPDATE to authenticated using ((select transfers_private.has_permission('edit_status_history'))) with check ((select transfers_private.has_permission('edit_status_history')));
create policy "Permission select gate" on public.driver_activity as restrictive for SELECT to authenticated using ((select transfers_private.has_permission('driver_activity'))) ;
create policy "Permission insert gate" on public.driver_activity as restrictive for INSERT to authenticated  with check ((select transfers_private.has_any_permission(array['driver_schedules','copy_schedules','driver_profiles','driver_phones','repeat_schedules','driver_reports','driver_activity','reorder_drivers','send_sms'])));
create policy "Permission select gate" on public.transfer_chat_messages as restrictive for SELECT to authenticated using ((select transfers_private.has_permission('chat'))) ;
create policy "Permission insert gate" on public.transfer_chat_messages as restrictive for INSERT to authenticated  with check ((select transfers_private.has_permission('chat')));
create policy "Permission delete gate" on public.transfer_chat_messages as restrictive for DELETE to authenticated using ((select transfers_private.has_permission('clear_chat'))) ;
alter policy "Admins clear chat" on public.transfer_chat_messages using ((select transfers_private.has_permission('clear_chat')));
create policy "Permission select gate" on public.transfer_sms_log as restrictive for SELECT to authenticated using ((select transfers_private.has_permission('send_sms'))) ;
create policy "Permission select gate" on public.summary_deleted_records as restrictive for SELECT to authenticated using ((select transfers_private.has_permission('deleted_records'))) ;
create policy "Permission update gate" on public.summary_deleted_records as restrictive for UPDATE to authenticated using ((select transfers_private.has_any_permission(array['summary_edit','restore_records']))) with check ((select transfers_private.has_any_permission(array['summary_edit','restore_records'])));
CREATE OR REPLACE FUNCTION public.apply_driver_week(p_driver text, p_month date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare w jsonb; n integer; actor text;
begin
 if not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
  if auth.uid() is null then raise exception 'Sign in to apply a schedule'; end if;
  if p_month is null or p_month <> date_trunc('month',p_month)::date then raise exception 'Choose a month'; end if;
  select weekly_schedule into w from public.transfer_drivers where name=p_driver for update;
  if w is null then raise exception 'Save a weekly schedule first'; end if;
  select display_name into actor from public.profiles where id=auth.uid();
  insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name)
  select p_driver,d::date,nullif(w->extract(dow from d)::integer->>'start','')::time,
      nullif(w->extract(dow from d)::integer->>'end','')::time,auth.uid(),coalesce(actor,'User')
  from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
  on conflict(driver_name,schedule_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$
;
CREATE OR REPLACE FUNCTION transfers_private.build_vendor_transfer(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_name text;v_move bigint;
 v_date date;v_time time;v_duration integer;v_pallets integer;
 v_driver text;v_origin text;v_destination text;v_job text;v_status text;
begin
 if v_actor is null or not transfers_private.has_permission('create_load') then raise exception 'Build transfer access required' using errcode='42501';end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.clear_transfer_chat()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not transfers_private.has_permission('clear_chat') then raise exception 'Admin access required' using errcode='42501';end if;
 delete from public.transfer_chat_messages where id is not null;
end $function$
;
CREATE OR REPLACE FUNCTION public.edit_summary_record(p_type text, p_id uuid, p_deleted boolean, p_date date, p_status text, p_custom_title text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare current_custom text;
begin
 if not transfers_private.has_permission('summary_edit') then raise exception 'Report editing access required' using errcode='42501';end if;
 if auth.uid() is null then raise exception 'Sign in to edit report records'; end if;
 if p_date is null then raise exception 'Choose a date'; end if;
 if p_status is null or (p_status='' and not p_deleted) then raise exception 'Choose a status'; end if;
 if p_type='Job' then
   if not(p_deleted and p_status='') and p_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered') then raise exception 'Choose a valid job status'; end if;
 elsif p_type='Time-slot status' then
   if not(p_deleted and p_status='') and p_status not in ('Driving','Yard Moves','Loading','Standby','Job Pushed','Custom') then raise exception 'Choose a valid time-slot status'; end if;
   if p_status='Custom' and (nullif(btrim(p_custom_title),'') is null or length(p_custom_title)>80) then raise exception 'Enter a custom title of up to 80 characters'; end if;
 else raise exception 'Invalid record type';
 end if;
 if p_deleted then
   update public.summary_deleted_records set scheduled_date=p_date,recorded_status=p_status,
     record_data=record_data||jsonb_build_object('scheduled_date',p_date,
       case when p_type='Job' then 'order_status' else 'status' end,p_status,
       'custom_title',case when p_status='Custom' then btrim(p_custom_title) else null end,'schedule_date_inferred',case when scheduled_date is distinct from p_date then false else coalesce((record_data->>'schedule_date_inferred')::boolean,false) end)
   where record_type=p_type and record_id=p_id;
 elsif p_type='Job' then
   update public.transfers set scheduled_date=p_date,order_status=p_status,updated_at=now() where id=p_id;
 else
   update public.transfer_slot_statuses set scheduled_date=p_date,status=p_status,custom_title=case when p_status='Custom' then btrim(p_custom_title) else null end where id=p_id;
 end if;
 if not found then raise exception 'Record no longer exists. Run the report again.'; end if;
end $function$
;
CREATE OR REPLACE FUNCTION transfers_private.list_access_users()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not transfers_private.access_is_admin() or not transfers_private.has_permission('manage_users') then raise exception 'Admin access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'display_name',p.display_name,'role',a.role) order by lower(u.email)),'[]'::jsonb)
 from transfers_private.user_access a join auth.users u on u.id=a.user_id left join public.profiles p on p.id=u.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.reorder_transfer_drivers(p_names text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_name text;v_pos integer:=0;
begin
 if not transfers_private.has_permission('reorder_drivers') then raise exception 'Admin access required' using errcode='42501';end if;
 foreach v_name in array p_names loop
 update public.transfer_drivers set sort_order=v_pos where name=v_name;
 v_pos:=v_pos+1;
 end loop;
end $function$
;
CREATE OR REPLACE FUNCTION public.replace_driver_schedule_month(p_driver text, p_month date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare w jsonb; n integer; actor text;
begin
 if not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 if auth.uid() is null then raise exception 'Sign in to apply a schedule'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'Choose a month'; end if;
 select weekly_schedule into w from public.transfer_drivers where name=p_driver for update;
 if w is null then raise exception 'Save a weekly schedule first'; end if;
 select display_name into actor from public.profiles where id=auth.uid();
 insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name,updated_at)
 select p_driver,d::date,nullif(w->extract(dow from d)::integer->>'start','')::time,nullif(w->extract(dow from d)::integer->>'end','')::time,auth.uid(),coalesce(actor,'User'),now()
 from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day')d
 on conflict(driver_name,schedule_date) do update set start_time=excluded.start_time,end_time=excluded.end_time,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=excluded.updated_at;
 get diagnostics n=row_count;
 return n;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_driver_profile(p_original text, p_name text, p_full_name text, p_phone text, p_email text, p_notes text, p_week jsonb, p_repeat boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_name text:=btrim(p_name); target date:=(date_trunc('month',now() at time zone 'America/Chicago')+interval '1 month')::date;
  last_month date; n integer:=0; actor text;
begin
 if not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required' using errcode='42501';end if;
  if auth.uid() is null then raise exception 'Sign in to save a driver'; end if;
  if v_name is null or length(v_name) not between 1 and 120 or lower(v_name)='planning' then raise exception 'Enter a driver slot name other than Planning'; end if;
  if p_original is not null and p_original <> v_name then raise exception 'The existing driver slot name cannot be changed'; end if;
  if p_week is null or not public.valid_driver_week(p_week) then raise exception 'Provide seven valid days with both times or a day off'; end if;
  if length(coalesce(p_full_name,''))>200 or length(coalesce(p_email,''))>254 or length(coalesce(p_notes,''))>3000 then raise exception 'Driver information is too long'; end if;
  select display_name into actor from public.profiles where id=auth.uid();
  if p_original is null then
    insert into public.transfer_drivers(name,full_name,phone_number,email,notes,weekly_schedule,auto_repeat,created_by,created_by_name)
    values(v_name,btrim(p_full_name),nullif(btrim(p_phone),''),btrim(p_email),btrim(p_notes),p_week,coalesce(p_repeat,false),auth.uid(),coalesce(actor,'User'));
  else
    update public.transfer_drivers set full_name=btrim(p_full_name),phone_number=nullif(btrim(p_phone),''),email=btrim(p_email),notes=btrim(p_notes),weekly_schedule=p_week,auto_repeat=coalesce(p_repeat,false)
    where name=p_original;
    if not found then raise exception 'Driver no longer exists'; end if;
  end if;
  select auto_generated_month into last_month from public.transfer_drivers where name=v_name for update;
  if p_repeat and (last_month is null or last_month<target) then
    n:=public.apply_driver_week(v_name,target);
    update public.transfer_drivers set auto_generated_month=target where name=v_name;
  end if;
  return jsonb_build_object('name',v_name,'generated_days',n,'generated_month',case when p_repeat then target else null end);
end $function$
;
CREATE OR REPLACE FUNCTION public.save_summary_record(p_type text, p_id uuid, p_deleted boolean, p_date date, p_status text, p_custom_title text DEFAULT NULL::text, p_time time without time zone DEFAULT NULL::time without time zone, p_duration integer DEFAULT NULL::integer, p_pallets integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.summary_deleted_records%rowtype; j jsonb; actor text; result jsonb;
begin
 if p_deleted and p_status<>'Deleted' then
 if not transfers_private.has_permission('restore_records') then raise exception 'Restoration access required' using errcode='42501';end if;
 elsif not transfers_private.has_permission('summary_edit') then raise exception 'Report editing access required' using errcode='42501';end if;
 if auth.uid() is null then raise exception 'Sign in to edit report records'; end if;
 if p_date is null then raise exception 'Choose a date'; end if;
 if not p_deleted then
   perform public.edit_summary_record(p_type,p_id,false,p_date,p_status,p_custom_title);
   return jsonb_build_object('restored',false);
 end if;
 select * into a from public.summary_deleted_records where record_type=p_type and record_id=p_id and restored_at is null for update;
 if not found then raise exception 'Deleted record is no longer available. Run the report again.'; end if;
 j:=a.record_data;
 if p_status='Deleted' then
   perform public.edit_summary_record(p_type,p_id,true,p_date,a.recorded_status,j->>'custom_title');
   return jsonb_build_object('restored',false);
 end if;
 select display_name into actor from public.profiles where id=auth.uid();
 if p_type='Job' then
   if p_status is null or p_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered') then raise exception 'Choose a valid job status'; end if;
   p_time:=coalesce(p_time,(j->>'scheduled_time')::time);
   p_duration:=coalesce(p_duration,(j->>'duration_minutes')::integer);
   p_pallets:=coalesce(p_pallets,(j->>'pallet_count')::integer);
   if p_time is null or p_duration is null or p_pallets is null then raise exception 'Enter the time, duration and pallet count needed to restore this load'; end if;
   if p_time<'04:00'::time or p_time>'20:00'::time then raise exception 'Restored load time must be between 4 AM and 8 PM'; end if;
   if nullif(j->>'origin','') is null or nullif(j->>'destination','') is null or nullif(j->>'job_number','') is null then raise exception 'This older record lacks route or job details required for restoration'; end if;
   insert into public.transfers(id,scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,
     duration_minutes,order_status,move_number,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,
     created_by,created_by_name,created_at)
   values(p_id,p_date,p_time,a.driver,j->>'origin',j->>'destination',p_pallets,j->>'job_number',
     p_duration,p_status,coalesce((j->>'move_number')::bigint,nextval('public.transfer_move_number_seq'::regclass)),
     coalesce((j->>'urgent')::boolean,false),(j->>'pickup_by_date')::date,(j->>'pickup_by_time')::time,(j->>'deliver_by_date')::date,(j->>'deliver_by_time')::time,
     auth.uid(),coalesce(nullif(j->>'created_by_name',''),actor,'User'),coalesce((j->>'created_at')::timestamptz,now()))
   returning to_jsonb(transfers.*) into result;
 elsif p_type='Time-slot status' then
   if p_status is null or p_status not in ('Driving','Yard Moves','Loading','Standby','Job Pushed','Custom') then raise exception 'Choose a valid time-slot status'; end if;
   if p_status='Custom' and (nullif(btrim(p_custom_title),'') is null or length(p_custom_title)>80) then raise exception 'Enter a custom title of up to 80 characters'; end if;
   if exists(select 1 from public.transfer_slot_statuses where driver=a.driver and scheduled_date=p_date and start_minutes<(j->>'end_minutes')::integer and end_minutes>(j->>'start_minutes')::integer) then raise exception 'This status overlaps an existing time-slot status on that date'; end if;
   insert into public.transfer_slot_statuses(id,scheduled_date,driver,start_minutes,end_minutes,status,custom_title,notes,created_by,created_at)
   values(p_id,p_date,a.driver,(j->>'start_minutes')::integer,(j->>'end_minutes')::integer,p_status,
     case when p_status='Custom' then btrim(p_custom_title) else null end,j->>'notes',auth.uid(),coalesce((j->>'created_at')::timestamptz,now()))
   returning to_jsonb(transfer_slot_statuses.*) into result;
 else raise exception 'Invalid record type';
 end if;
 update public.summary_deleted_records set restored_at=now() where id=a.id;
 return jsonb_build_object('restored',true,'record',result);
end $function$
;
CREATE OR REPLACE FUNCTION transfers_private.set_access_role(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;
begin
 if not transfers_private.access_is_admin() or not transfers_private.has_permission('manage_users') then raise exception 'Admin access required' using errcode='42501';end if;
 if p_role not in ('User','Admin','Vendor') or p_role is null then raise exception 'Choose Vendor, User, or Admin';end if;
 select role into v_role from transfers_private.user_access where user_id=p_user_id for update;
 if not found then raise exception 'User not found';end if;
 if v_role='Owner' then raise exception 'The Owner role is protected' using errcode='42501';end if;
 if p_user_id=auth.uid() then raise exception 'Ask another administrator to change your role';end if;
 update transfers_private.user_access set role=p_role,updated_at=now(),updated_by=auth.uid() where user_id=p_user_id;
end $function$
;

create function transfers_private.enforce_transfer_permissions() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
 if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_by_name is distinct from old.created_by_name or new.move_number is distinct from old.move_number or new.created_at is distinct from old.created_at then raise exception 'Load identity and creator cannot be changed' using errcode='42501';end if;
 if (new.scheduled_date,new.scheduled_time,new.driver) is distinct from (old.scheduled_date,old.scheduled_time,old.driver) and not transfers_private.has_any_permission(array['edit_load','move_load','summary_edit']) then raise exception 'Moving loads is not permitted' using errcode='42501';end if;
 if new.duration_minutes is distinct from old.duration_minutes and not transfers_private.has_any_permission(array['edit_load','resize_load','summary_edit']) then raise exception 'Resizing loads is not permitted' using errcode='42501';end if;
 if (new.origin,new.destination,new.pallet_count,new.job_number,new.order_status) is distinct from (old.origin,old.destination,old.pallet_count,old.job_number,old.order_status) and not transfers_private.has_any_permission(array['edit_load','summary_edit']) then raise exception 'Editing loads is not permitted' using errcode='42501';end if;
 if new.linked_next_id is distinct from old.linked_next_id and not transfers_private.has_permission('link_boxes') then raise exception 'Linking loads is not permitted' using errcode='42501';end if;
 if (new.urgent,new.pickup_by_date,new.pickup_by_time,new.deliver_by_date,new.deliver_by_time) is distinct from (old.urgent,old.pickup_by_date,old.pickup_by_time,old.deliver_by_date,old.deliver_by_time) and not transfers_private.has_permission('load_deadlines') then raise exception 'Urgency and deadline editing is not permitted' using errcode='42501';end if;
 else
 if not transfers_private.has_any_permission(array['create_load','duplicate_load','duplicate_day','restore_records']) then raise exception 'Creating loads is not permitted' using errcode='42501';end if;
 if (new.urgent or new.pickup_by_date is not null or new.pickup_by_time is not null or new.deliver_by_date is not null or new.deliver_by_time is not null) and not transfers_private.has_any_permission(array['load_deadlines','duplicate_load','duplicate_day','restore_records']) then raise exception 'Urgency and deadline access required' using errcode='42501';end if;
 end if;
 return new;
end $$;
create trigger enforce_transfer_permissions before insert or update on public.transfers for each row execute function transfers_private.enforce_transfer_permissions();
create function transfers_private.enforce_status_permissions() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or tg_op='INSERT' then return new;end if;
 if (new.driver,new.scheduled_date,new.start_minutes,new.end_minutes) is distinct from (old.driver,old.scheduled_date,old.start_minutes,old.end_minutes) and not transfers_private.has_any_permission(array['manage_status','summary_edit']) then raise exception 'Moving or resizing statuses is not permitted' using errcode='42501';end if;
 if (new.notes,new.custom_title,new.status) is distinct from (old.notes,old.custom_title,old.status) and not transfers_private.has_any_permission(array['status_notes','summary_edit']) then raise exception 'Editing status notes is not permitted' using errcode='42501';end if;
 return new;
end $$;
create trigger enforce_status_permissions before update on public.transfer_slot_statuses for each row execute function transfers_private.enforce_status_permissions();
create function transfers_private.enforce_driver_permissions() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
 if new.sort_order is distinct from old.sort_order and not transfers_private.has_permission('reorder_drivers') then raise exception 'Driver ordering access required' using errcode='42501';end if;
 if new.phone_number is distinct from old.phone_number and not transfers_private.has_permission('driver_phones') then raise exception 'Driver phone access required' using errcode='42501';end if;
 if (new.full_name,new.email,new.notes) is distinct from (old.full_name,old.email,old.notes) and not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required' using errcode='42501';end if;
 if (new.weekly_schedule,new.auto_repeat,new.auto_generated_month) is distinct from (old.weekly_schedule,old.auto_repeat,old.auto_generated_month) and not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 else
 if nullif(new.phone_number,'') is not null and not transfers_private.has_permission('driver_phones') then raise exception 'Driver phone access required' using errcode='42501';end if;
 if (new.auto_repeat or exists(select 1 from jsonb_array_elements(new.weekly_schedule)d where nullif(d->>'start','') is not null)) and not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 end if;
 return new;
end $$;
create trigger enforce_driver_permissions before insert or update on public.transfer_drivers for each row execute function transfers_private.enforce_driver_permissions();
revoke all on function transfers_private.enforce_transfer_permissions(),transfers_private.enforce_status_permissions(),transfers_private.enforce_driver_permissions() from public,anon,authenticated;

-- Follow-up dependency and resize adjustment
update transfers_private.permission_config set catalog='[{"key":"view_board","group":"Transfers","label":"View Transfers board","dependencies":[],"adminOnly":false,"fixed":false},{"key":"board_navigation","group":"Transfers","label":"Change day and view the clock / planning count","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"create_load","group":"Transfers","label":"Build a new transfer load","dependencies":[],"adminOnly":false,"fixed":false},{"key":"load_deadlines","group":"Transfers","label":"Set urgent flag and pickup / delivery deadlines","dependencies":["create_load"],"adminOnly":false,"fixed":false},{"key":"edit_load","group":"Transfers","label":"Edit load details and order status","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"delete_load","group":"Transfers","label":"Delete loads","dependencies":["view_board","edit_load"],"adminOnly":false,"fixed":false},{"key":"move_load","group":"Transfers","label":"Drag loads between drivers and times","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"resize_load","group":"Transfers","label":"Resize load duration","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"duplicate_load","group":"Transfers","label":"Duplicate a load","dependencies":["view_board","create_load","edit_load"],"adminOnly":false,"fixed":false},{"key":"duplicate_day","group":"Transfers","label":"Duplicate a day''s loads","dependencies":["view_board","create_load"],"adminOnly":false,"fixed":false},{"key":"create_status","group":"Transfers","label":"Assign time-slot statuses","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"status_notes","group":"Transfers","label":"Edit time-slot notes and custom titles","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"manage_status","group":"Transfers","label":"Move, resize, and delete time-slot boxes","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"link_boxes","group":"Transfers","label":"Link and unlink job / status boxes","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"reorder_drivers","group":"Transfers","label":"Reorder driver columns","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"status_history","group":"Transfers","label":"View status history","dependencies":["edit_load"],"adminOnly":false,"fixed":false},{"key":"edit_status_history","group":"Transfers","label":"Edit status change times","dependencies":["status_history"],"adminOnly":false,"fixed":false},{"key":"send_sms","group":"Transfers","label":"Text drivers","dependencies":["edit_load"],"adminOnly":false,"fixed":false},{"key":"driver_schedules","group":"Drivers","label":"View and edit driver schedules","dependencies":[],"adminOnly":false,"fixed":false},{"key":"copy_schedules","group":"Drivers","label":"Copy schedules by day, week, or month","dependencies":["driver_schedules"],"adminOnly":false,"fixed":false},{"key":"driver_profiles","group":"Drivers","label":"Add drivers and edit driver information","dependencies":[],"adminOnly":false,"fixed":false},{"key":"driver_phones","group":"Drivers","label":"Manage driver phone numbers","dependencies":["driver_profiles"],"adminOnly":false,"fixed":false},{"key":"repeat_schedules","group":"Drivers","label":"Set weekly schedules and automatic monthly repeats","dependencies":["driver_profiles","driver_schedules"],"adminOnly":false,"fixed":false},{"key":"driver_reports","group":"Drivers","label":"Run driver reports and export PDF","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"driver_activity","group":"Drivers","label":"View driver activity and overtime indicators","dependencies":[],"adminOnly":false,"fixed":false},{"key":"locations","group":"Locations","label":"View, add, edit, and delete locations","dependencies":[],"adminOnly":false,"fixed":false},{"key":"summary_reports","group":"Summary","label":"Run past-job and status reports","dependencies":[],"adminOnly":false,"fixed":false},{"key":"summary_filters","group":"Summary","label":"Filter by date, driver, type, status, location, and search","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"summary_export","group":"Summary","label":"Export CSV and print reports","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"deleted_records","group":"Summary","label":"View deleted records","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"summary_edit","group":"Summary","label":"Edit record dates and statuses","dependencies":["summary_reports"],"adminOnly":false,"fixed":false},{"key":"restore_records","group":"Summary","label":"Restore deleted jobs and time-slot statuses","dependencies":["deleted_records","summary_edit"],"adminOnly":false,"fixed":false},{"key":"chat","group":"Communication and access","label":"Use Team Chat and emojis","dependencies":[],"adminOnly":false,"fixed":false},{"key":"clear_chat","group":"Communication and access","label":"Clear Team Chat","dependencies":["chat"],"adminOnly":false,"fixed":false},{"key":"recent_activity","group":"Communication and access","label":"View, search, and open Recent Activity records","dependencies":["view_board"],"adminOnly":false,"fixed":false},{"key":"active_users","group":"Communication and access","label":"View Active Users","dependencies":[],"adminOnly":false,"fixed":false},{"key":"manage_users","group":"Communication and access","label":"Open User Access and assign roles","dependencies":[],"adminOnly":true,"fixed":false},{"key":"view_permissions","group":"Communication and access","label":"View this Permissions grid","dependencies":[],"adminOnly":true,"fixed":false},{"key":"trailer_link","group":"Communication and access","label":"Show Live Trailer Board link","dependencies":[],"adminOnly":false,"fixed":false},{"key":"theme","group":"Communication and access","label":"Switch light / dark theme","dependencies":[],"adminOnly":false,"fixed":false},{"key":"sign_out","group":"Communication and access","label":"Sign out","dependencies":[],"adminOnly":false,"fixed":true}]'::jsonb;
create or replace function transfers_private.enforce_transfer_permissions() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
 if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_by_name is distinct from old.created_by_name or new.move_number is distinct from old.move_number or new.created_at is distinct from old.created_at then raise exception 'Load identity and creator cannot be changed' using errcode='42501';end if;
 if (new.scheduled_date,new.scheduled_time,new.driver) is distinct from (old.scheduled_date,old.scheduled_time,old.driver) and not (transfers_private.has_any_permission(array['edit_load','move_load','summary_edit']) or (transfers_private.has_permission('resize_load') and new.scheduled_date=old.scheduled_date and new.driver=old.driver and new.duration_minutes is distinct from old.duration_minutes)) then raise exception 'Moving loads is not permitted' using errcode='42501';end if;
 if new.duration_minutes is distinct from old.duration_minutes and not transfers_private.has_any_permission(array['edit_load','resize_load','summary_edit']) then raise exception 'Resizing loads is not permitted' using errcode='42501';end if;
 if (new.origin,new.destination,new.pallet_count,new.job_number,new.order_status) is distinct from (old.origin,old.destination,old.pallet_count,old.job_number,old.order_status) and not transfers_private.has_any_permission(array['edit_load','summary_edit']) then raise exception 'Editing loads is not permitted' using errcode='42501';end if;
 if new.linked_next_id is distinct from old.linked_next_id and not transfers_private.has_permission('link_boxes') then raise exception 'Linking loads is not permitted' using errcode='42501';end if;
 if (new.urgent,new.pickup_by_date,new.pickup_by_time,new.deliver_by_date,new.deliver_by_time) is distinct from (old.urgent,old.pickup_by_date,old.pickup_by_time,old.deliver_by_date,old.deliver_by_time) and not transfers_private.has_permission('load_deadlines') then raise exception 'Urgency and deadline editing is not permitted' using errcode='42501';end if;
 else
 if not transfers_private.has_any_permission(array['create_load','duplicate_load','duplicate_day','restore_records']) then raise exception 'Creating loads is not permitted' using errcode='42501';end if;
 if (new.urgent or new.pickup_by_date is not null or new.pickup_by_time is not null or new.deliver_by_date is not null or new.deliver_by_time is not null) and not transfers_private.has_any_permission(array['load_deadlines','duplicate_load','duplicate_day','restore_records']) then raise exception 'Urgency and deadline access required' using errcode='42501';end if;
 end if;
 return new;
end $$;
