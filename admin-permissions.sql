CREATE OR REPLACE FUNCTION transfers_private.save_role_permissions(p_roles jsonb, p_revision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text;f jsonb;k text;d text;v integer;actor_role text;
begin
 actor_role:=transfers_private.current_access_role();
 if auth.uid() is null or actor_role not in ('Owner','Admin') or (actor_role='Admin' and not transfers_private.has_permission('view_permissions')) then raise exception 'Owner or Admin permission access required' using errcode='42501';end if;
 select revision into v from transfers_private.permission_config where singleton=true for update;
 if p_revision is distinct from v then raise exception 'Permissions changed since you opened this grid. Close and reopen it before saving.';end if;
 if p_roles is null or jsonb_typeof(p_roles)<>'object' or (select count(*) from jsonb_object_keys(p_roles))<>3 then raise exception 'Provide Admin, User, and Vendor permissions';end if;
 if actor_role='Admin' and (p_roles->'Admin') is distinct from (select permissions from transfers_private.role_permissions where role='Admin') then raise exception 'Only the Owner can change Admin permissions' using errcode='42501';end if;
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
 if actor_role='Owner' or r<>'Admin' then
 update transfers_private.role_permissions set permissions=p_roles->r where role=r;
 end if;
 end loop;
 update transfers_private.permission_config set revision=revision+1,updated_at=now(),updated_by=auth.uid() where singleton=true;
end $function$
