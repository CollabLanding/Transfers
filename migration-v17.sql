-- Notes attached to individual time-slot status boxes.
alter table public.transfer_slot_statuses
  add column if not exists notes text;

select pg_notify('pgrst', 'reload schema');
