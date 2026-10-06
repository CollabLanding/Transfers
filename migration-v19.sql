-- Transfers: add a persistent Custom time-slot status title.
-- Safe to run more than once.

alter table public.transfer_slot_statuses
  add column if not exists custom_title text;

alter table public.transfer_slot_statuses
  drop constraint if exists transfer_slot_statuses_status_check;

alter table public.transfer_slot_statuses
  add constraint transfer_slot_statuses_status_check
  check (
    status = any (
      array[
        'Driving'::text,
        'Yard Moves'::text,
        'Loading'::text,
        'Standby'::text,
        'Job Pushed'::text,
        'Custom'::text
      ]
    )
  );

notify pgrst, 'reload schema';