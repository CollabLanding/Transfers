create schema sms_private;
revoke all on schema sms_private from public,anon,authenticated;
grant usage on schema sms_private to service_role;
create table sms_private.inbound_messages (
 provider text not null, message_id text not null, from_number text not null,
 to_number text not null, message text not null, message_at timestamptz not null,
 received_at timestamptz not null default now(), driver text, transfer_id uuid,
 requested_status text, outcome text not null default 'received',
 primary key(provider,message_id)
);
alter table sms_private.inbound_messages enable row level security;
create policy service_only on sms_private.inbound_messages to service_role using(true) with check(true);
revoke all on sms_private.inbound_messages from public,anon,authenticated;
grant select,insert,update on sms_private.inbound_messages to service_role;

create function sms_private.normalize_phone(raw text) returns text language sql immutable set search_path='' as $$
 select case when length(d)=10 then '+1'||d when length(d)=11 and left(d,1)='1' then '+'||d when left(trim(raw),1)='+' and length(d) between 8 and 15 then '+'||d else null end
 from (select regexp_replace(coalesce(raw,''),'[^0-9]','','g') d) x;
$$;
revoke all on function sms_private.normalize_phone(text) from public,anon,authenticated;
grant execute on function sms_private.normalize_phone(text) to service_role;

create function sms_private.process_reply(p_message_id text,p_from text,p_to text,p_text text,p_message_at timestamptz)
 returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
<<reply>>
declare
 phone text:=sms_private.normalize_phone(p_from); dest text:=sms_private.normalize_phone(p_to);
 driver_name text; matches int; ids uuid[]; selected public.transfers%rowtype;
 normalized text; requested text; explicit_move text; extracted text[];
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
   -- Recheck after the lock: dispatch may have edited or reassigned the load.
   if not found or selected.driver is distinct from driver_name or selected.scheduled_date is distinct from (p_message_at at time zone 'America/Chicago')::date
     or selected.scheduled_date+selected.scheduled_time>p_message_at at time zone 'America/Chicago'
     or selected.order_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site')
     or (explicit_move is not null and selected.move_number::text is distinct from explicit_move)
     or (explicit_move is null and selected.order_status='Planned' and selected.scheduled_date+selected.scheduled_time+make_interval(mins=>selected.duration_minutes)<=p_message_at at time zone 'America/Chicago') then outcome:='load_changed';
   elsif selected.updated_at>p_message_at then outcome:='stale_message';
   elsif selected.order_status=requested then outcome:='already_current';
   else
    select coalesce(max(id),0) into previous_activity from public.transfer_activity where transfer_id=selected.id;
    update public.transfers set order_status=requested,updated_at=now() where id=selected.id;
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
  values(selected.id,'SMS received',driver_name||' (SMS)',selected.move_number,selected.job_number,driver_name,'Status reply: '||requested||' · '||outcome);
 end if;
 return jsonb_build_object('outcome',outcome,'status',requested,'transfer_id',selected.id,'duplicate',false);
end;$$;
revoke all on function sms_private.process_reply(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function sms_private.process_reply(text,text,text,text,timestamptz) to service_role;
create function public.process_driver_sms_reply(p_message_id text,p_from text,p_to text,p_text text,p_message_at timestamptz)
 returns jsonb language sql security invoker set search_path='' as $$select sms_private.process_reply(p_message_id,p_from,p_to,p_text,p_message_at);$$;
revoke all on function public.process_driver_sms_reply(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.process_driver_sms_reply(text,text,text,text,timestamptz) to service_role;
