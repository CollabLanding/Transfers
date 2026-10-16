
create schema if not exists edit_private;
revoke all on schema edit_private from public;
grant usage on schema edit_private to authenticated,service_role;
create table if not exists public.edit_attempts(
 id bigint generated always as identity primary key, request_id uuid not null default gen_random_uuid(),
 table_name text not null,record_id uuid not null,actor_id uuid,actor_name text not null,
 attempted_at timestamptz not null default clock_timestamp(),outcome text not null,
 operation text not null,expected_revision bigint,current_revision bigint,requested jsonb,current_record jsonb,reason text
);
alter table public.edit_attempts enable row level security;
revoke all on public.edit_attempts from anon,authenticated;
grant select on public.edit_attempts to authenticated;
create index if not exists edit_attempts_time_idx on public.edit_attempts(attempted_at desc,id desc);
create index if not exists edit_attempts_record_idx on public.edit_attempts(table_name,record_id,id desc);
create or replace function edit_private.record_attempt(p_table text,p_id uuid,p_outcome text,p_operation text,p_expected bigint,p_current bigint,p_requested jsonb,p_record jsonb,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $fn$
declare actor text;
begin
 actor:=coalesce(nullif(auth.jwt()->>'email',''),'System / SMS');
 insert into public.edit_attempts(table_name,record_id,actor_id,actor_name,outcome,operation,expected_revision,current_revision,requested,current_record,reason)
 values(p_table,p_id,auth.uid(),split_part(actor,'@',1),p_outcome,p_operation,p_expected,p_current,p_requested,p_record,p_reason);
end $fn$;
revoke all on function edit_private.record_attempt(text,uuid,text,text,bigint,bigint,jsonb,jsonb,text) from public,anon;
grant execute on function edit_private.record_attempt(text,uuid,text,text,bigint,bigint,jsonb,jsonb,text) to authenticated,service_role;
create or replace function edit_private.bump_revision() returns trigger language plpgsql set search_path='' as $fn$
begin new.edit_revision:=old.edit_revision+1;return new;end $fn$;
revoke all on function edit_private.bump_revision() from public;
create or replace function edit_private.audit_applied() returns trigger language plpgsql security definer set search_path='' as $fn$
declare before_row jsonb;after_row jsonb;patch jsonb;rid uuid;
begin
 before_row:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_row:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 rid:=coalesce((after_row->>'id')::uuid,(before_row->>'id')::uuid);
 select coalesce(jsonb_object_agg(key,value),'{}') into patch from jsonb_each(after_row)
 where value is distinct from before_row->key and key not in ('edit_revision','updated_at','updated_by','updated_by_email');
 perform edit_private.record_attempt(tg_table_name,rid,'applied',lower(tg_op),(before_row->>'edit_revision')::bigint,(after_row->>'edit_revision')::bigint,patch,after_row,null);
 if tg_op='DELETE' then return old;end if;return new;
end $fn$;
revoke all on function edit_private.audit_applied() from public;
drop policy if exists "Read edit history" on public.edit_attempts;create policy "Read edit history" on public.edit_attempts for select to authenticated using (transfers_private.has_any_permission(array['recent_activity','summary_reports']));
alter table public.transfers add column if not exists edit_revision bigint not null default 0;
create trigger zz_edit_revision before update on public.transfers for each row execute function edit_private.bump_revision();
create trigger zz_edit_audit after insert or update or delete on public.transfers for each row execute function edit_private.audit_applied();
alter table public.transfer_slot_statuses add column if not exists edit_revision bigint not null default 0;
create trigger zz_edit_revision before update on public.transfer_slot_statuses for each row execute function edit_private.bump_revision();
create trigger zz_edit_audit after insert or update or delete on public.transfer_slot_statuses for each row execute function edit_private.audit_applied();

create or replace function public.guarded_edit(p_table text,p_ids uuid[],p_expected jsonb,p_patch jsonb default '{}'::jsonb,p_operation text default 'update')
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare rid uuid; row_json jsonb; snapshots jsonb:='{}'; results jsonb:='[]'; cols text; conflict boolean:=false; reason text; rev bigint;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_table not in ('transfers','transfer_slot_statuses') or p_operation not in ('update','delete') or coalesce(cardinality(p_ids),0) not between 1 and 100 then raise exception 'Invalid edit request';end if;
 for rid in select distinct x from unnest(p_ids) x order by x loop
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_table) into row_json using rid;
  if row_json is null then raise exception 'Record unavailable or permission denied' using errcode='42501';end if;
  snapshots:=jsonb_set(snapshots,array[rid::text],row_json);
  if not (p_expected ? rid::text) or (p_expected->>rid::text)::bigint is distinct from (row_json->>'edit_revision')::bigint then conflict:=true;end if;
 end loop;
 if conflict then
  for rid in select distinct x from unnest(p_ids) x loop
   row_json:=snapshots->rid::text;
   perform edit_private.record_attempt(p_table,rid,'conflict',p_operation,(p_expected->>rid::text)::bigint,(row_json->>'edit_revision')::bigint,p_patch,row_json,'Record changed after it was opened; no changes applied.');
  end loop;
  return jsonb_build_object('ok',false,'conflict',true,'current',snapshots,'message','Another user changed this record after you opened it. Your attempt was recorded. Review the latest version before applying your changes.');
 end if;
 begin
  if p_operation='update' then
   if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Empty edit';end if;
   if exists(select 1 from jsonb_object_keys(p_patch) k where k in ('id','created_at','created_by','created_by_name','move_number','edit_revision') or not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=k)) then raise exception 'Protected or unknown field';end if;
   select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,p_table,k),',') into cols from jsonb_object_keys(p_patch) k;
  end if;
  for rid in select distinct x from unnest(p_ids) x order by x loop
   if p_operation='delete' then execute format('delete from public.%I where id=$1 returning to_jsonb(%I.*)',p_table,p_table) into row_json using rid;
   else execute format('update public.%I set %s where id=$2 returning to_jsonb(%I.*)',p_table,cols,p_table) into row_json using p_patch,rid;end if;
   if row_json is null then raise exception 'Edit permission denied' using errcode='42501';end if;
   results:=results||jsonb_build_array(row_json);
  end loop;
 exception when others then
  reason:=sqlerrm;
  for rid in select distinct x from unnest(p_ids) x loop
   row_json:=snapshots->rid::text;
   perform edit_private.record_attempt(p_table,rid,'rejected',p_operation,(p_expected->>rid::text)::bigint,(row_json->>'edit_revision')::bigint,p_patch,row_json,reason);
  end loop;
  return jsonb_build_object('ok',false,'message',reason);
 end;
 return jsonb_build_object('ok',true,'rows',results);
end $fn$;
revoke all on function public.guarded_edit(text,uuid[],jsonb,jsonb,text) from public,anon;
grant execute on function public.guarded_edit(text,uuid[],jsonb,jsonb,text) to authenticated;
create or replace function edit_private.record_attempt(p_table text,p_id uuid,p_outcome text,p_operation text,p_expected bigint,p_current bigint,p_requested jsonb,p_record jsonb,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $fn$
declare actor text;
begin
 actor:=case when auth.uid() is null then coalesce(nullif(current_setting('edit.sms_actor',true),''),'System') else coalesce(nullif(auth.jwt()->>'email',''),'User') end;
 insert into public.edit_attempts(table_name,record_id,actor_id,actor_name,outcome,operation,expected_revision,current_revision,requested,current_record,reason)
 values(p_table,p_id,auth.uid(),split_part(actor,'@',1),p_outcome,p_operation,p_expected,p_current,p_requested,p_record,p_reason);
end $fn$;
CREATE OR REPLACE FUNCTION sms_private.process_reply(p_message_id text, p_from text, p_to text, p_text text, p_message_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
#variable_conflict use_column
<<reply>>
declare
 phone text:=sms_private.normalize_phone(p_from); dest text:=sms_private.normalize_phone(p_to);
 driver_name text; matches int; ids uuid[]; selected public.transfers%rowtype;
 normalized text; requested text; explicit_move text; extracted text[];
 completion_location boolean:=false; arrival_location text; origin_match boolean; destination_match boolean;
 outcome text; previous_activity bigint; result jsonb;
begin
 if p_message_id is null or length(p_message_id) not between 1 and 150 or phone is null or dest is null or p_text is null or length(p_text)>1600 or p_message_at is null then raise exception 'Invalid SMS event'; end if;
 insert into sms_private.inbound_messages(provider,message_id,from_number,to_number,message,message_at)
 values('dialpad',p_message_id,phone,dest,p_text,p_message_at) on conflict do nothing;
 if not found then
  select jsonb_build_object('outcome',outcome,'status',requested_status,'transfer_id',transfer_id,'duplicate',true) into result
  from sms_private.inbound_messages where provider='dialpad' and message_id=p_message_id;
  return result;
 end if;

 -- Lock the driver profile so simultaneous replies for one phone are serialized.
 perform 1 from public.transfer_drivers where sms_private.normalize_phone(phone_number)=phone order by name for update;
 select count(*),min(name) into matches,driver_name from public.transfer_drivers where sms_private.normalize_phone(phone_number)=phone;
 if matches=0 then outcome:='unknown_driver'; elsif matches>1 then outcome:='ambiguous_phone'; end if;

 normalized:=trim(regexp_replace(lower(p_text),'[[:space:]]+',' ','g'));
 -- Only a whole recognized status, optionally paired with one Move #, is a command.
 extracted:=regexp_match(normalized,'^(?:move[[:space:]]*)?#([0-9]+)[[:space:]:-]+(.+)$');
 if extracted is not null then explicit_move:=extracted[1];normalized:=extracted[2];
 else
  extracted:=regexp_match(normalized,'^(.+?)[[:space:]]+(?:move[[:space:]]*)?#([0-9]+)$');
  if extracted is not null then normalized:=extracted[1];explicit_move:=extracted[2];end if;
 end if;
 normalized:=regexp_replace(normalized,'[.!]+$','');
 requested:=case normalized when 'waiting' then 'Waiting' when 'loading' then 'Loading' when 'loaded' then 'Loaded' when 'in transit' then 'In Transit' when 'in-transit' then 'In Transit' when 'intransit' then 'In Transit' when 'on site' then 'On Site' when 'on-site' then 'On Site' when 'onsite' then 'On Site' when 'delivered' then 'Delivered' else null end;
 extracted:=regexp_match(normalized,'^arrived at[[:space:]]+(.+)$');
 if extracted is not null then arrival_location:=trim(extracted[1]);requested:='Arrival';
 else
  extracted:=regexp_match(normalized,'^done at[[:space:]]+(.+)$');
  if extracted is not null then arrival_location:=trim(extracted[1]);completion_location:=true;requested:='Completion';end if;
 end if;
 if outcome is null and requested is null then outcome:='unrecognized_status';end if;
 if outcome is null and (p_message_at<now()-interval '24 hours' or p_message_at>now()+interval '5 minutes') then outcome:='stale_message';end if;

 if outcome is null then
  -- Current means one unfinished, started load on the message's Chicago date.
  -- Operational statuses remain current past their planned duration; Planned
  -- loads qualify only while the message falls inside their scheduled window.
  select array_agg(id order by id) into ids from public.transfers
  where driver=driver_name and scheduled_date=(p_message_at at time zone 'America/Chicago')::date
   and scheduled_date+scheduled_time <= p_message_at at time zone 'America/Chicago'
   and order_status in ('Planned','Waiting','Loading','Loaded','In Transit','On Site')
   and (explicit_move is null or move_number::text=explicit_move)
   and (explicit_move is not null or order_status<>'Planned' or scheduled_date+scheduled_time+make_interval(mins=>duration_minutes)>p_message_at at time zone 'America/Chicago');
  if coalesce(cardinality(ids),0)=0 then outcome:='no_current_load';
  elsif cardinality(ids)>1 then outcome:='ambiguous_load';
  else
   select * into selected from public.transfers where id=ids[1] for update;
   if arrival_location is not null then
    origin_match:=arrival_location=trim(regexp_replace(lower(coalesce(selected.origin,'')),'[[:space:]]+',' ','g'));
    destination_match:=arrival_location=trim(regexp_replace(lower(coalesce(selected.destination,'')),'[[:space:]]+',' ','g'));
    requested:=case when completion_location then case when destination_match then 'Delivered' else null end when origin_match and not destination_match then 'Waiting' when destination_match and not origin_match then 'On Site' else null end;
   end if;
   -- Recheck after the lock: dispatch may have edited or reassigned the load.
   if not found or selected.driver is distinct from driver_name or selected.scheduled_date is distinct from (p_message_at at time zone 'America/Chicago')::date
     or selected.scheduled_date+selected.scheduled_time>p_message_at at time zone 'America/Chicago'
     or selected.order_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site')
     or (explicit_move is not null and selected.move_number::text is distinct from explicit_move)
     or (explicit_move is null and selected.order_status='Planned' and selected.scheduled_date+selected.scheduled_time+make_interval(mins=>selected.duration_minutes)<=p_message_at at time zone 'America/Chicago') then outcome:='load_changed';
   elsif arrival_location is not null and requested is null then outcome:=case when origin_match and destination_match then 'ambiguous_location' else 'unknown_location' end;
   elsif selected.updated_at>p_message_at then outcome:='stale_message';
   elsif selected.order_status=requested then outcome:='already_current';
   else
    select coalesce(max(id),0) into previous_activity from public.transfer_activity where transfer_id=selected.id;
    perform set_config('edit.sms_actor',driver_name||' (SMS)',true);
    update public.transfers set order_status=requested,updated_at=now() where id=selected.id;
    perform set_config('edit.sms_actor','',true);
    -- Preserve the normal Status changed entry/format used by the timeline.
    update public.transfer_activity set actor_name=driver_name||' (SMS)',created_at=p_message_at
     where transfer_id=selected.id and id>previous_activity and action='Status changed' and actor_id is null;
    outcome:='updated';
   end if;
  end if;
 end if;

 update sms_private.inbound_messages set driver=driver_name,transfer_id=selected.id,requested_status=requested,outcome=reply.outcome
 where provider='dialpad' and message_id=p_message_id;
 if selected.id is not null and outcome<>'updated' then
  insert into public.transfer_activity(transfer_id,action,actor_name,move_number,job_number,driver,details)
  values(selected.id,'SMS received',driver_name||' (SMS)',selected.move_number,selected.job_number,driver_name,'Status reply: '||coalesce(requested,p_text)||' · '||outcome);
 end if;
 return jsonb_build_object('outcome',outcome,'status',requested,'transfer_id',selected.id,'duplicate',false);
end;$function$
;
CREATE OR REPLACE FUNCTION sms_private.process_twilio_reply(p_message_id text, p_from text, p_to text, p_text text, p_message_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
#variable_conflict use_column
<<reply>>
declare
 phone text:=sms_private.normalize_phone(p_from); dest text:=sms_private.normalize_phone(p_to);
 driver_name text; matches int; ids uuid[]; selected public.transfers%rowtype;
 normalized text; requested text; explicit_move text; extracted text[];
 completion_location boolean:=false; arrival_location text; origin_match boolean; destination_match boolean;
 outcome text; previous_activity bigint; result jsonb;
begin
 if p_message_id is null or length(p_message_id) not between 1 and 150 or phone is null or dest is null or p_text is null or length(p_text)>1600 or p_message_at is null then raise exception 'Invalid SMS event'; end if;
 insert into sms_private.inbound_messages(provider,message_id,from_number,to_number,message,message_at)
 values('twilio',p_message_id,phone,dest,p_text,p_message_at) on conflict do nothing;
 if not found then
  select jsonb_build_object('outcome',outcome,'status',requested_status,'transfer_id',transfer_id,'duplicate',true) into result
  from sms_private.inbound_messages where provider='twilio' and message_id=p_message_id;
  return result;
 end if;

 -- Lock the driver profile so simultaneous replies for one phone are serialized.
 perform 1 from public.transfer_drivers where sms_private.normalize_phone(phone_number)=phone order by name for update;
 select count(*),min(name) into matches,driver_name from public.transfer_drivers where sms_private.normalize_phone(phone_number)=phone;
 if matches=0 then outcome:='unknown_driver'; elsif matches>1 then outcome:='ambiguous_phone'; end if;

 normalized:=trim(regexp_replace(lower(p_text),'[[:space:]]+',' ','g'));
 -- Only a whole recognized status, optionally paired with one Move #, is a command.
 extracted:=regexp_match(normalized,'^(?:move[[:space:]]*)?#([0-9]+)[[:space:]:-]+(.+)$');
 if extracted is not null then explicit_move:=extracted[1];normalized:=extracted[2];
 else
  extracted:=regexp_match(normalized,'^(.+?)[[:space:]]+(?:move[[:space:]]*)?#([0-9]+)$');
  if extracted is not null then normalized:=extracted[1];explicit_move:=extracted[2];end if;
 end if;
 normalized:=regexp_replace(normalized,'[.!]+$','');
 requested:=case normalized when 'waiting' then 'Waiting' when 'loading' then 'Loading' when 'loaded' then 'Loaded' when 'in transit' then 'In Transit' when 'in-transit' then 'In Transit' when 'intransit' then 'In Transit' when 'on site' then 'On Site' when 'on-site' then 'On Site' when 'onsite' then 'On Site' when 'delivered' then 'Delivered' else null end;
 extracted:=regexp_match(normalized,'^arrived at[[:space:]]+(.+)$');
 if extracted is not null then arrival_location:=trim(extracted[1]);requested:='Arrival';
 else
  extracted:=regexp_match(normalized,'^done at[[:space:]]+(.+)$');
  if extracted is not null then arrival_location:=trim(extracted[1]);completion_location:=true;requested:='Completion';end if;
 end if;
 if outcome is null and requested is null then outcome:='unrecognized_status';end if;
 if outcome is null and (p_message_at<now()-interval '24 hours' or p_message_at>now()+interval '5 minutes') then outcome:='stale_message';end if;

 if outcome is null then
  -- Current means one unfinished, started load on the message's Chicago date.
  -- Operational statuses remain current past their planned duration; Planned
  -- loads qualify only while the message falls inside their scheduled window.
  select array_agg(id order by id) into ids from public.transfers
  where driver=driver_name and scheduled_date=(p_message_at at time zone 'America/Chicago')::date
   and scheduled_date+scheduled_time <= p_message_at at time zone 'America/Chicago'
   and order_status in ('Planned','Waiting','Loading','Loaded','In Transit','On Site')
   and (explicit_move is null or move_number::text=explicit_move)
   and (explicit_move is not null or order_status<>'Planned' or scheduled_date+scheduled_time+make_interval(mins=>duration_minutes)>p_message_at at time zone 'America/Chicago');
  if coalesce(cardinality(ids),0)=0 then outcome:='no_current_load';
  elsif cardinality(ids)>1 then outcome:='ambiguous_load';
  else
   select * into selected from public.transfers where id=ids[1] for update;
   if arrival_location is not null then
    origin_match:=arrival_location=trim(regexp_replace(lower(coalesce(selected.origin,'')),'[[:space:]]+',' ','g'));
    destination_match:=arrival_location=trim(regexp_replace(lower(coalesce(selected.destination,'')),'[[:space:]]+',' ','g'));
    requested:=case when completion_location then case when destination_match then 'Delivered' else null end when origin_match and not destination_match then 'Waiting' when destination_match and not origin_match then 'On Site' else null end;
   end if;
   -- Recheck after the lock: dispatch may have edited or reassigned the load.
   if not found or selected.driver is distinct from driver_name or selected.scheduled_date is distinct from (p_message_at at time zone 'America/Chicago')::date
     or selected.scheduled_date+selected.scheduled_time>p_message_at at time zone 'America/Chicago'
     or selected.order_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site')
     or (explicit_move is not null and selected.move_number::text is distinct from explicit_move)
     or (explicit_move is null and selected.order_status='Planned' and selected.scheduled_date+selected.scheduled_time+make_interval(mins=>selected.duration_minutes)<=p_message_at at time zone 'America/Chicago') then outcome:='load_changed';
   elsif arrival_location is not null and requested is null then outcome:=case when origin_match and destination_match then 'ambiguous_location' else 'unknown_location' end;
   elsif selected.updated_at>p_message_at then outcome:='stale_message';
   elsif selected.order_status=requested then outcome:='already_current';
   else
    select coalesce(max(id),0) into previous_activity from public.transfer_activity where transfer_id=selected.id;
    perform set_config('edit.sms_actor',driver_name||' (SMS)',true);
    update public.transfers set order_status=requested,updated_at=now() where id=selected.id;
    perform set_config('edit.sms_actor','',true);
    -- Preserve the normal Status changed entry/format used by the timeline.
    update public.transfer_activity set actor_name=driver_name||' (SMS)',created_at=p_message_at
     where transfer_id=selected.id and id>previous_activity and action='Status changed' and actor_id is null;
    outcome:='updated';
   end if;
  end if;
 end if;

 update sms_private.inbound_messages set driver=driver_name,transfer_id=selected.id,requested_status=requested,outcome=reply.outcome
 where provider='twilio' and message_id=p_message_id;
 if selected.id is not null and outcome<>'updated' then
  insert into public.transfer_activity(transfer_id,action,actor_name,move_number,job_number,driver,details)
  values(selected.id,'SMS received',driver_name||' (SMS)',selected.move_number,selected.job_number,driver_name,'Status reply: '||coalesce(requested,p_text)||' · '||outcome);
 end if;
 return jsonb_build_object('outcome',outcome,'status',requested,'transfer_id',selected.id,'duplicate',false);
end;$function$
;