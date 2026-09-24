alter table public.transfer_slot_statuses drop constraint transfer_slot_statuses_status_check;
alter table public.transfer_slot_statuses add constraint transfer_slot_statuses_status_check check (status in ('Driving','Yard Moves','Loading','Standby'));
