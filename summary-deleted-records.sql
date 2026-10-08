
create table public.summary_deleted_records(
 id uuid primary key default gen_random_uuid(),
 record_type text not null check(record_type in ('Job','Time-slot status')),
 record_id uuid not null,
 scheduled_date date not null,
 driver text not null,
 recorded_status text not null default '',
 record_data jsonb not null,
 deleted_at timestamptz not null default now(),
 partial_history boolean not null default false,
 unique(record_type,record_id)
);
alter table public.summary_deleted_records enable row level security;
create policy "summary archive read" on public.summary_deleted_records for select to authenticated using(true);
create policy "summary archive edit" on public.summary_deleted_records for update to authenticated using(true) with check(true);
revoke all on public.summary_deleted_records from anon,authenticated;
grant select on public.summary_deleted_records to authenticated;
grant update(scheduled_date,recorded_status,record_data) on public.summary_deleted_records to authenticated;
create index summary_deleted_records_date_idx on public.summary_deleted_records(scheduled_date,driver);

create or replace function transfers_private.archive_summary_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb:=to_jsonb(old); kind text; stat text;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('transfers','transfer_slot_statuses') or tg_op<>'DELETE' then raise exception 'Invalid archive trigger'; end if;
 kind:=case when tg_table_name='transfers' then 'Job' else 'Time-slot status' end;
 stat:=coalesce(payload->>'order_status',payload->>'status','');
 insert into public.summary_deleted_records(record_type,record_id,scheduled_date,driver,recorded_status,record_data)
 values(kind,old.id,old.scheduled_date,old.driver,stat,payload)
 on conflict(record_type,record_id) do update set scheduled_date=excluded.scheduled_date,driver=excluded.driver,recorded_status=excluded.recorded_status,record_data=excluded.record_data,deleted_at=now(),partial_history=false;
 return old;
end $$;
revoke all on function transfers_private.archive_summary_deletion() from public,anon,authenticated;
create trigger archive_deleted_job before delete on public.transfers for each row execute function transfers_private.archive_summary_deletion();
create trigger archive_deleted_slot_status before delete on public.transfer_slot_statuses for each row execute function transfers_private.archive_summary_deletion();

-- Older deleted jobs retain only the details present in their activity logs.
insert into public.summary_deleted_records(record_type,record_id,scheduled_date,driver,recorded_status,record_data,deleted_at,partial_history)
select 'Job',a.transfer_id,
 coalesce(case when r.details ~ '^\d{4}-\d{2}-\d{2} ' then left(r.details,10)::date end,(a.created_at at time zone 'America/Chicago')::date),
 coalesce(a.driver,'Unassigned'),coalesce(split_part(st.details,' → ',2),''),
 jsonb_strip_nulls(jsonb_build_object('id',a.transfer_id,'job_number',a.job_number,'move_number',a.move_number,
 'origin',split_part(a.details,' → ',1),'destination',split_part(a.details,' → ',2),
 'scheduled_time',case when r.details ~ '^\d{4}-\d{2}-\d{2} [0-9]{2}:[0-9]{2}' then substring(r.details from 12 for 5) else null end,
 'schedule_date_inferred',not coalesce(r.details ~ '^\d{4}-\d{2}-\d{2} ',false))),
 a.created_at,true
from (select distinct on(transfer_id) * from public.transfer_activity where action='Deleted' and transfer_id is not null order by transfer_id,created_at desc)a
left join lateral(select details from public.transfer_activity where transfer_id=a.transfer_id and action='Rescheduled' and created_at<=a.created_at order by created_at desc limit 1)r on true
left join lateral(select details from public.transfer_activity where transfer_id=a.transfer_id and action='Status changed' and created_at<=a.created_at order by created_at desc limit 1)st on true
where not exists(select 1 from public.transfers where id=a.transfer_id)
on conflict(record_type,record_id) do nothing;

create or replace function public.edit_summary_record(p_type text,p_id uuid,p_deleted boolean,p_date date,p_status text,p_custom_title text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare current_custom text;
begin
 if auth.uid() is null then raise exception 'Sign in to edit report records'; end if;
 if p_date is null then raise exception 'Choose a date'; end if;
 if p_status is null or (p_status='' and not p_deleted) then raise exception 'Choose a status'; end if;
 if p_type='Job' then
   if not(p_deleted and p_status='') and p_status not in ('Planned','Waiting','Loading','Loaded','In Transit','On Site','Delivered') then raise exception 'Choose a valid job status'; end if;
 elsif p_type='Time-slot status' then
   if not(p_deleted and p_status='') and p_status not in ('Driving','Yard Moves','Loading','Standby','Job Pushed','Custom') then raise exception 'Choose a valid time-slot status'; end if;
   if p_status='Custom' and (nullif(btrim(p_custom_title),'') is null or length(p_custom_title)>80) then raise exception 'Enter a custom title of up to 80 characters'; end if;
 else raise exception 'Invalid record type';
 end if;
 if p_deleted then
   update public.summary_deleted_records set scheduled_date=p_date,recorded_status=p_status,
     record_data=record_data||jsonb_build_object('scheduled_date',p_date,
       case when p_type='Job' then 'order_status' else 'status' end,p_status,
       'custom_title',case when p_status='Custom' then btrim(p_custom_title) else null end,'schedule_date_inferred',case when scheduled_date is distinct from p_date then false else coalesce((record_data->>'schedule_date_inferred')::boolean,false) end)
   where record_type=p_type and record_id=p_id;
 elsif p_type='Job' then
   update public.transfers set scheduled_date=p_date,order_status=p_status,updated_at=now() where id=p_id;
 else
   update public.transfer_slot_statuses set scheduled_date=p_date,status=p_status,custom_title=case when p_status='Custom' then btrim(p_custom_title) else null end where id=p_id;
 end if;
 if not found then raise exception 'Record no longer exists. Run the report again.'; end if;
end $$;
revoke all on function public.edit_summary_record(text,uuid,boolean,date,text,text) from public,anon;
grant execute on function public.edit_summary_record(text,uuid,boolean,date,text,text) to authenticated;
