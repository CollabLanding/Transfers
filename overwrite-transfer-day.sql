create or replace function public.overwrite_transfer_day(p_source date,p_destination date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare source_rows jsonb; row_data public.transfers; copied integer:=0; removed integer:=0; creator text;
begin
 if auth.uid() is null or not transfers_private.has_permission('duplicate_day') or not transfers_private.has_permission('delete_load') then raise exception 'Duplicate Day and Delete Load permissions are required to overwrite a day.' using errcode='42501';end if;
 if p_source is null or p_destination is null or p_source=p_destination then raise exception 'Choose a different destination day.';end if;
 if p_source not between date '2020-01-01' and date '2100-12-31' or p_destination not between date '2020-01-01' and date '2100-12-31' then raise exception 'Choose a valid date.';end if;
 perform pg_advisory_xact_lock(7021,least(p_source,p_destination)-date '2000-01-01');
 perform pg_advisory_xact_lock(7021,greatest(p_source,p_destination)-date '2000-01-01');
 select jsonb_agg(to_jsonb(t) order by t.scheduled_time,t.move_number) into source_rows from (select * from public.transfers where scheduled_date=p_source for share) t;
 if coalesce(jsonb_array_length(source_rows),0)=0 then raise exception 'There are no transfers on the source day to duplicate.';end if;
 select coalesce(nullif(display_name,''),nullif(split_part(auth.jwt()->>'email','@',1),''),'User') into creator from public.profiles where id=auth.uid();
 creator:=coalesce(creator,'User');
 perform id from public.transfers where scheduled_date=p_destination order by id for update;
 delete from public.transfers where scheduled_date=p_destination;
 get diagnostics removed=row_count;
 if exists(select 1 from public.transfers where scheduled_date=p_destination) then raise exception 'Not all destination jobs could be replaced.';end if;
 for row_data in select * from jsonb_populate_recordset(null::public.transfers,source_rows) loop
  insert into public.transfers(scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,additional_stop,additional_stop_2,dock_number,pallet_count,job_number,order_status,urgent,pickup_by_date,pickup_by_time,deliver_by_date,deliver_by_time,created_by,created_by_name)
  values(p_destination,row_data.scheduled_time,row_data.duration_minutes,row_data.driver,row_data.origin,row_data.destination,row_data.additional_stop,row_data.additional_stop_2,row_data.dock_number,row_data.pallet_count,row_data.job_number,'Planned',row_data.urgent,row_data.pickup_by_date+(p_destination-p_source),row_data.pickup_by_time,row_data.deliver_by_date+(p_destination-p_source),row_data.deliver_by_time,auth.uid(),creator);
  copied:=copied+1;
 end loop;
 return jsonb_build_object('copied',copied,'removed',removed);
end $$;
revoke all on function public.overwrite_transfer_day(date,date) from public,anon;
grant execute on function public.overwrite_transfer_day(date,date) to authenticated;
notify pgrst,'reload schema';
