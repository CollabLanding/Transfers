begin;
do $$
declare actor uuid; test_driver text:='__terminal_job_type_test_'||gen_random_uuid()::text; sid uuid; n int; v record;
begin
 select id into actor from auth.users order by created_at limit 1;
 insert into public.transfer_drivers(name,created_by) values(test_driver,actor);
 insert into public.driver_schedules(driver_name,schedule_date,start_time,end_time,updated_by) values(test_driver,'2098-01-01','06:00','18:00',actor) returning id into sid;
 if exists(select 1 from public.transfer_slot_statuses where auto_schedule_id=sid) then raise exception 'Shuttle generated status';end if;
 update public.transfer_drivers set job_type='Terminal Truck' where name=test_driver;
 select * into v from public.transfer_slot_statuses where auto_schedule_id=sid;
 if v.status is distinct from 'Yard Moves' or v.start_minutes<>360 or v.end_minutes<>1080 then raise exception 'Type assignment did not backfill schedule';end if;
 update public.driver_schedules set start_time='07:00',end_time='17:00' where id=sid;
 if not exists(select 1 from public.transfer_slot_statuses where auto_schedule_id=sid and start_minutes=420 and end_minutes=1020) then raise exception 'Schedule update failed';end if;
 update public.driver_schedules set start_time=null,end_time=null where id=sid;
 if exists(select 1 from public.transfer_slot_statuses where auto_schedule_id=sid) then raise exception 'OFF retained generated status';end if;
 update public.driver_schedules set start_time='18:00',end_time='06:00' where id=sid;
 select count(*) into n from public.transfer_slot_statuses where auto_schedule_id=sid;
 if n<>2 then raise exception 'Overnight not split';end if;
 insert into public.transfer_slot_statuses(driver,scheduled_date,start_minutes,end_minutes,status,created_by,notes) values(test_driver,'2098-01-01',420,480,'Standby',actor,'Manual status preserved');
 update public.transfer_drivers set job_type='Shuttle' where name=test_driver;
 if exists(select 1 from public.transfer_slot_statuses where auto_schedule_id=sid) then raise exception 'Shuttle retained auto statuses';end if;
 if not exists(select 1 from public.transfer_slot_statuses where driver=test_driver and notes='Manual status preserved') then raise exception 'Manual status removed';end if;
 update public.transfer_drivers set job_type='Terminal Truck' where name=test_driver;
 delete from public.driver_schedules where id=sid;
 if exists(select 1 from public.transfer_slot_statuses where auto_schedule_id=sid) then raise exception 'Deleted schedule retained status';end if;
end $$;
select 'PASS: default, backfill, schedule edits, OFF, overnight, type cleanup, manual preservation, deletion; rolled back' verification;
rollback;