alter table public.transfer_drivers add column is_active boolean not null default true;
create function transfers_private.guard_driver_active_status() returns trigger language plpgsql set search_path='' as $$
begin
 if (tg_op='INSERT' and not new.is_active) or (tg_op='UPDATE' and new.is_active is distinct from old.is_active) then
  if auth.uid() is null or not transfers_private.has_permission('driver_profiles') then raise exception 'Driver profile access required to change active status' using errcode='42501';end if;
 end if;
 return new;
end $$;
create trigger guard_driver_active_status before insert or update on public.transfer_drivers for each row execute function transfers_private.guard_driver_active_status();
create function transfers_private.audit_driver_active_status() returns trigger language plpgsql security definer set search_path='' as $$
declare actor text;
begin
 if new.is_active is distinct from old.is_active then
  select split_part(coalesce(display_name,'User'),'@',1) into actor from public.profiles where id=auth.uid();
  insert into public.driver_activity(driver_name,action,details,actor_id,actor_name)
  values(new.name,case when new.is_active then 'Driver activated' else 'Driver marked inactive' end,
   case when old.is_active then 'Active → Inactive' else 'Inactive → Active' end,auth.uid(),coalesce(actor,'User'));
 end if;
 return new;
end $$;
revoke all on function transfers_private.audit_driver_active_status() from public,anon,authenticated;
create trigger audit_driver_active_status after update of is_active on public.transfer_drivers for each row execute function transfers_private.audit_driver_active_status();
