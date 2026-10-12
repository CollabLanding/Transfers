begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='psaverchenko@collectfanatics.com'),true);
set local role authenticated;
do $test$
declare d text:='Resize verification '||gen_random_uuid()::text; a uuid;b uuid;c uuid;u uuid;s uuid;o uuid;r jsonb;
begin
 insert into public.transfer_drivers(name,created_by,created_by_name) values(d,auth.uid(),'Test');
 insert into public.transfers(scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,duration_minutes,created_by,created_by_name)
 values('2099-01-01','06:00',d,'Test','Test',0,'Test',60,auth.uid(),'Test') returning id into a;
 insert into public.transfers(scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,duration_minutes,created_by,created_by_name)
 values('2099-01-01','07:30',d,'Test','Test',0,'Test',60,auth.uid(),'Test') returning id into b;
 insert into public.transfers(scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,duration_minutes,created_by,created_by_name)
 values('2099-01-01','10:00',d,'Test','Test',0,'Test',60,auth.uid(),'Test') returning id into c;
 insert into public.transfers(scheduled_date,scheduled_time,driver,origin,destination,pallet_count,job_number,duration_minutes,created_by,created_by_name)
 values('2099-01-01','05:00',d,'Test','Test',0,'Test',30,auth.uid(),'Test') returning id into u;
 insert into public.transfer_slot_statuses(scheduled_date,driver,start_minutes,end_minutes,status,created_by)
 values('2099-01-01',d,540,570,'Standby',auth.uid()) returning id into s;
 perform public.set_board_box_link('job:'||u,'job:'||a);
 perform public.set_board_box_link('job:'||a,'job:'||b);
 perform public.set_board_box_link('status:'||s,'job:'||b);
 perform public.set_board_box_link('status:'||s,'job:'||c);
 r:=public.resize_board_link_group('job:'||a,360,450,360,420);
 if (select scheduled_time from public.transfers where id=b)<>time '08:00' or (select scheduled_time from public.transfers where id=c)<>time '10:30'
 or (select start_minutes from public.transfer_slot_statuses where id=s)<>570 or (select scheduled_time from public.transfers where id=u)<>time '05:00' then raise exception 'Job resize following failed';end if;
 perform public.resize_board_link_group('job:'||a,375,450,360,450);
 if (select scheduled_time from public.transfers where id=b)<>time '08:00' then raise exception 'Top resize moved follower';end if;
 perform public.resize_board_link_group('status:'||s,570,630,570,600);
 if (select scheduled_time from public.transfers where id=c)<>time '11:00' or (select scheduled_time from public.transfers where id=b)<>time '08:00' then raise exception 'Status resize following failed';end if;
 perform public.resize_board_link_group('status:'||s,570,600,570,630);
 if (select scheduled_time from public.transfers where id=c)<>time '10:30' then raise exception 'Shrink failed';end if;
 insert into public.transfer_slot_statuses(scheduled_date,driver,start_minutes,end_minutes,status,created_by)
 values('2099-01-01',d,615,645,'Driving',auth.uid()) returning id into o;
 begin
  perform public.resize_board_link_group('job:'||a,375,480,375,450);raise exception 'Overlap accepted';
 exception when others then if sqlerrm<>'A linked status would overlap another status' then raise;end if;end;
 if (select duration_minutes from public.transfers where id=a)<>75 or (select scheduled_time from public.transfers where id=b)<>time '08:00' then raise exception 'Failed resize partially saved';end if;
 begin perform public.resize_board_link_group('job:'||a,375,465,360,420);raise exception 'Stale anchor accepted';
 exception when others then if sqlerrm<>'This box changed while resizing. Try again.' then raise;end if;end;
 begin perform public.resize_board_link_group('status:'||s,570,1320,570,600);raise exception 'Out of bounds accepted';
 exception when others then if sqlerrm<>'All linked boxes must fit within the board hours' then raise;end if;end;
 if has_function_privilege('anon','public.resize_board_link_group(text,integer,integer,integer,integer)','execute') then raise exception 'Anonymous resize allowed';end if;
end;$test$;
select 'PASS: authenticated atomic resize, job/status downstream chain, reverse links, top edge, grow/shrink, unchanged upstream, collision rollback, stale edit, board bounds and anonymous denial' result;
rollback;
