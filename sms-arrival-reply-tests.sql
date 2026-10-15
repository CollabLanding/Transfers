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

 r:=public.process_twilio_driver_sms_reply('done-wrong',phone,'+15550101000','Done at wrong place',at);
 if r->>'outcome'<>'unknown_location' then raise exception 'Unknown site accepted: %',r;end if;
 r:=public.process_twilio_driver_sms_reply('done-origin',phone,'+15550101000','Done at SMS test origin',at);
 if r->>'outcome'<>'unknown_location' or (select order_status from public.transfers where id=a)<>'Loading' then raise exception 'Origin completion changed job: %',r;end if;
 r:=public.process_twilio_driver_sms_reply('done-arrival',phone,'+15550101000','Arrived at SMS test destination',at);
 if r->>'status'<>'On Site' then raise exception 'Arrival regression: %',r;end if;
 update public.transfers set updated_at=at-interval '1 minute' where id=a;
 r:=public.process_twilio_driver_sms_reply('done-dest',phone,'+15550101000','  DONE AT   SMS test destination! #'||(select move_number from public.transfers where id=a),at);
 if r->>'outcome'<>'updated' or (select order_status from public.transfers where id=a)<>'Delivered' then raise exception 'Destination completion failed: %',r;end if;
 if not exists(select 1 from public.transfer_activity where transfer_id=a and actor_name=d||' (SMS)' and details='On Site → Delivered' and created_at=at) then raise exception 'Completion audit missing';end if;
 select count(*) into n from public.transfer_activity where transfer_id=a;
 r:=public.process_twilio_driver_sms_reply('done-dest',phone,'+15550101000','Done at SMS test destination',at);
 if not (r->>'duplicate')::boolean or (select count(*) from public.transfer_activity where transfer_id=a)<>n then raise exception 'Duplicate completion';end if;
end;$test$;
select 'PASS: done at destination, origin/unknown refusal, case/spacing, Move #, arrival regression, driver audit/time, duplicate retries' result;
rollback;
