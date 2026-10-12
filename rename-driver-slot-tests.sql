begin;
do $test$
declare uid uuid;oldname text:='Rename verification '||gen_random_uuid()::text;newname text:=oldname||' new';adminname text:=oldname||' admin';load_id uuid;status_id uuid;week jsonb:='[{"start":null,"end":null},{"start":null,"end":null},{"start":null,"end":null},{"start":null,"end":null},{"start":null,"end":null},{"start":null,"end":null},{"start":null,"end":null}]';result jsonb;
begin
 select user_id into uid from transfers_private.user_access where role='Owner' limit 1;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.save_driver_profile(null,oldname,'Full Name','+15550101001','test@example.invalid','Notes',week,false);
 insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by,updated_by_name) values(oldname,'2099-01-01','06:00','16:00',uid,'Test');
 insert into public.transfers(scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,duration_minutes,created_by,created_by_name)
 values('2099-01-01','06:00',oldname,'Test','Test',0,'Test',60,uid,'Test') returning id into load_id;
 insert into public.transfer_slot_statuses(scheduled_date,driver,start_minutes,end_minutes,status,created_by) values('2099-01-01',oldname,480,540,'Standby',uid) returning id into status_id;
 insert into public.summary_deleted_records(record_type,record_id,scheduled_date,driver,recorded_status,record_data)
 values('Job',gen_random_uuid(),'2099-01-01',oldname,'Planned',jsonb_build_object('driver',oldname));
 result:=public.save_driver_profile(oldname,newname,'Full Name','+15550101001','test@example.invalid','Notes',week,false);
 if result->>'name'<>newname or exists(select 1 from public.transfer_drivers where name=oldname) then raise exception 'Owner rename failed';end if;
 if not exists(select 1 from public.driver_schedules where driver_name=newname and schedule_date='2099-01-01') or (select driver from public.transfers where id=load_id)<>newname or (select driver from public.transfer_slot_statuses where id=status_id)<>newname then raise exception 'Schedules/loads/statuses lost association';end if;
 if exists(select 1 from public.summary_deleted_records where driver=oldname or record_data->>'driver'=oldname) then raise exception 'Archived driver lost association';end if;
 if not exists(select 1 from public.transfer_drivers where name=newname and full_name='Full Name' and phone_number='+15550101001' and notes='Notes') then raise exception 'Profile information lost';end if;
 update transfers_private.user_access set role='Admin' where user_id=uid;
 perform public.save_driver_profile(newname,adminname,'Full Name','+15550101001','test@example.invalid','Notes',week,false);
 begin perform public.save_driver_profile(adminname,'Planning','Full Name','+15550101001','','',week,false);raise exception 'Planning renamed';exception when others then if sqlerrm<>'Enter a driver slot name other than Planning' then raise;end if;end;
 perform public.save_driver_profile(null,oldname,'','','','',week,false);
 begin perform public.save_driver_profile(adminname,oldname,'Full Name','+15550101001','','',week,false);raise exception 'Duplicate name accepted';exception when others then if sqlerrm<>'That driver slot name already exists' then raise;end if;end;
 update transfers_private.user_access set role='User' where user_id=uid;
 begin perform transfers_private.rename_driver_slot(adminname,adminname||' forbidden');raise exception 'User renamed slot';exception when insufficient_privilege then null;end;
 begin update public.transfer_drivers set name=adminname||' forbidden' where name=adminname;raise exception 'User renamed slot directly';exception when insufficient_privilege then null;end;
 if not exists(select 1 from public.transfer_drivers where name=adminname) then raise exception 'Rejected rename changed data';end if;
end;$test$;
select 'PASS: Owner/Admin rename, loads/statuses/schedules/archive associations, profile preservation, duplicate/Planning validation, User RPC/direct-write denial' result;
rollback;
