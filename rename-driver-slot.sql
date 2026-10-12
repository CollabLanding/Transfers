create function transfers_private.rename_driver_slot(p_original text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare original text:=trim(p_original); replacement text:=trim(p_name);
begin
 if auth.uid() is null or transfers_private.current_access_role() not in ('Owner','Admin') then raise exception 'Only Admin and Owner accounts can rename driver slots' using errcode='42501';end if;
 if not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required' using errcode='42501';end if;
 if original is null or replacement is null or length(replacement) not between 1 and 120 or lower(original)='planning' or lower(replacement)='planning' then raise exception 'Choose a driver slot name other than Planning';end if;
 perform pg_advisory_xact_lock(70428119);
 perform 1 from public.transfer_drivers where name=original for update;
 if not found then raise exception 'Driver no longer exists. Reload the profile';end if;
 if original=replacement then return;end if;
 if exists(select 1 from public.transfer_drivers where lower(name)=lower(replacement) and name<>original) then raise exception 'That driver slot name already exists';end if;
 update public.transfer_drivers set name=replacement where name=original;
 -- Driver schedules use ON UPDATE CASCADE; these other references use text.
 update public.transfers set driver=replacement,updated_at=now() where driver=original;
 update public.transfer_slot_statuses set driver=replacement where driver=original;
 update public.transfer_activity set driver=replacement where driver=original;
 update public.driver_activity set driver_name=replacement where driver_name=original;
 update public.transfer_sms_log set driver=replacement where driver=original;
 update public.summary_deleted_records set driver=replacement,record_data=jsonb_set(record_data,'{driver}',to_jsonb(replacement)) where driver=original;
 update sms_private.inbound_messages set driver=replacement where driver=original;
 insert into public.driver_activity(driver_name,action,details,actor_id,actor_name)
 values(replacement,'Renamed','Driver slot: '||original||' → '||replacement,auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'Admin'));
end;$$;
revoke all on function transfers_private.rename_driver_slot(text,text) from public,anon;
grant execute on function transfers_private.rename_driver_slot(text,text) to authenticated;

CREATE OR REPLACE FUNCTION transfers_private.enforce_driver_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
 if new.name is distinct from old.name and transfers_private.current_access_role() not in ('Owner','Admin') then raise exception 'Only Admin and Owner accounts can rename driver slots' using errcode='42501';end if;
 if new.sort_order is distinct from old.sort_order and not transfers_private.has_permission('reorder_drivers') then raise exception 'Driver ordering access required' using errcode='42501';end if;
 if new.phone_number is distinct from old.phone_number and not transfers_private.has_permission('driver_phones') then raise exception 'Driver phone access required' using errcode='42501';end if;
 if (new.full_name,new.email,new.notes) is distinct from (old.full_name,old.email,old.notes) and not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required' using errcode='42501';end if;
 if (new.weekly_schedule,new.auto_repeat,new.auto_generated_month) is distinct from (old.weekly_schedule,old.auto_repeat,old.auto_generated_month) and not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 else
 if nullif(new.phone_number,'') is not null and not transfers_private.has_permission('driver_phones') then raise exception 'Driver phone access required' using errcode='42501';end if;
 if (new.auto_repeat or exists(select 1 from jsonb_array_elements(new.weekly_schedule)d where nullif(d->>'start','') is not null)) and not transfers_private.has_permission('repeat_schedules') then raise exception 'Weekly schedule access required' using errcode='42501';end if;
 end if;
 return new;
end $function$;
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

  if p_week is null or not public.valid_driver_week(p_week) then raise exception 'Provide seven valid days with both times or a day off'; end if;
  if length(coalesce(p_full_name,''))>200 or length(coalesce(p_email,''))>254 or length(coalesce(p_notes,''))>3000 then raise exception 'Driver information is too long'; end if;
  select display_name into actor from public.profiles where id=auth.uid();
  if p_original is null then
    insert into public.transfer_drivers(name,full_name,phone_number,email,notes,weekly_schedule,auto_repeat,created_by,created_by_name)
    values(v_name,btrim(p_full_name),nullif(btrim(p_phone),''),btrim(p_email),btrim(p_notes),p_week,coalesce(p_repeat,false),auth.uid(),coalesce(actor,'User'));
  else
    if p_original <> v_name then perform transfers_private.rename_driver_slot(p_original,v_name); end if;
    update public.transfer_drivers set full_name=btrim(p_full_name),phone_number=nullif(btrim(p_phone),''),email=btrim(p_email),notes=btrim(p_notes),weekly_schedule=p_week,auto_repeat=coalesce(p_repeat,false)
    where name=v_name;
    if not found then raise exception 'Driver no longer exists'; end if;
  end if;
  select auto_generated_month into last_month from public.transfer_drivers where name=v_name for update;
  if p_repeat and (last_month is null or last_month<target) then
    n:=public.apply_driver_week(v_name,target);
    update public.transfer_drivers set auto_generated_month=target where name=v_name;
  end if;
  return jsonb_build_object('name',v_name,'generated_days',n,'generated_month',case when p_repeat then target else null end);
end $function$;
