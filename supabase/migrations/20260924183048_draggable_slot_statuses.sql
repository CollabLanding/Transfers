grant update (driver, scheduled_date, start_minutes, end_minutes) on public.transfer_slot_statuses to authenticated;
create policy "Team can move slot statuses" on public.transfer_slot_statuses for update to authenticated using (true) with check (true);
