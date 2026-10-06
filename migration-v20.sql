-- Transfers: allow authenticated users to adjust timestamps on status-history transitions.
-- Restricts updates to Status changed activity rows.

drop policy if exists "transfer activity update status time" on public.transfer_activity;

create policy "transfer activity update status time"
  on public.transfer_activity
  for update
  to authenticated
  using (action = 'Status changed')
  with check (action = 'Status changed');

notify pgrst, 'reload schema';