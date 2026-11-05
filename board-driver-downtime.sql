-- Allow signed-in Transfers board users to see recorded driver downtime.
alter policy downtime_read on public.driver_downtime using ((select transfers_private.has_any_permission(array['view_board','driver_schedules','driver_reports','driver_activity'])));
