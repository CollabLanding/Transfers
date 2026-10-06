alter table public.transfer_locations
  add column if not exists address text,
  add column if not exists contact text;