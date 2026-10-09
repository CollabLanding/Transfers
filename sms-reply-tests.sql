begin;
set local role service_role;
do $test$
declare
 d text:='SMS verification '||gen_random_uuid()::text;
 phone text:='+15550101999'; at timestamptz:=now();
 today date:=(now() at time zone 'America/Chicago')::date;
 t time:=((now() at time zone 'America/Chicago')-interval '15 minutes')::time;
 a uuid; b uuid; r jsonb; n int;
begin
 insert into public.transfer_drivers(name,phone_number) values(d,phone);
 insert into public.transfers(scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,duration_minutes,order_status,updated_at,created_by,created_by_name)
 values(today,t,d,'SMS test origin','SMS test destination',0,'SMS verification',60,'Loading',at-interval '1 minute',(select id from public.profiles limit 1),'SMS verification') returning id into a;
 r:=public.process_driver_sms_reply('test-loaded',phone,'+15550101000','LOADED!',at);
 if r->>'outcome'<>'updated' or (select order_status from public.transfers where id=a)<>'Loaded' then raise exception 'Status update failed: %',r;end if;
 if not exists(select 1 from public.transfer_activity where transfer_id=a and action='Status changed' and actor_name=d||' (SMS)' and details='Loading → Loaded') then raise exception 'Status history attribution failed';end if;
 select count(*) into n from public.transfer_activity where transfer_id=a;
 r:=public.process_driver_sms_reply('test-loaded',phone,'+15550101000','LOADED!',at);
 if not (r->>'duplicate')::boolean or (select count(*) from public.transfer_activity where transfer_id=a)<>n then raise exception 'Duplicate updated twice';end if;
 r:=public.process_driver_sms_reply('test-unknown','+15550101111','+15550101000','Delivered',at);
 if r->>'outcome'<>'unknown_driver' then raise exception 'Unknown sender accepted';end if;
 r:=public.process_driver_sms_reply('test-prose',phone,'+15550101000','not loaded yet',at);
 if r->>'outcome'<>'unrecognized_status' then raise exception 'Prose interpreted as command';end if;
 r:=public.process_driver_sms_reply('test-old',phone,'+15550101000','Delivered',at-interval '25 hours');
 if r->>'outcome'<>'stale_message' then raise exception 'Old message accepted';end if;
 insert into public.transfers(scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,duration_minutes,order_status,updated_at,created_by,created_by_name)
 values(today,t,d,'SMS test origin','SMS test destination',0,'SMS verification overlap',60,'Loading',at-interval '1 minute',(select id from public.profiles limit 1),'SMS verification') returning id into b;
 r:=public.process_driver_sms_reply('test-overlap',phone,'+15550101000','Delivered',at);
 if r->>'outcome'<>'ambiguous_load' then raise exception 'Ambiguous assignment guessed';end if;
 update public.transfers set updated_at=at-interval '1 minute' where id=a;
 r:=public.process_driver_sms_reply('test-specific',phone,'+15550101000','In Transit #'||(select move_number from public.transfers where id=a),at);
 if r->>'outcome'<>'updated' or (select order_status from public.transfers where id=b)<>'Loading' then raise exception 'Explicit Move # failed: %',r;end if;
 update public.transfers set updated_at=at+interval '1 second' where id=a;
 r:=public.process_driver_sms_reply('test-late',phone,'+15550101000','#'||(select move_number from public.transfers where id=a)||' Delivered',at);
 if r->>'outcome'<>'stale_message' then raise exception 'Delayed reply overrode newer change';end if;
 insert into public.transfer_drivers(name,phone_number) values(d||' duplicate',phone);
 r:=public.process_driver_sms_reply('test-shared',phone,'+15550101000','Loaded',at);
 if r->>'outcome'<>'ambiguous_phone' then raise exception 'Shared phone guessed driver';end if;
 if has_function_privilege('authenticated','public.process_driver_sms_reply(text,text,text,text,timestamptz)','execute') or has_function_privilege('anon','public.process_driver_sms_reply(text,text,text,text,timestamptz)','execute') then raise exception 'Receiver RPC publicly callable';end if;
end;$test$;
select 'PASS: phone matching, status/history, duplicate retries, unknown sender, prose, stale replies, overlapping loads, Move #, newer edits, shared numbers, service-only access' result;
rollback;
