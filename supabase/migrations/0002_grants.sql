-- Newer Supabase projects don't grant the Data API roles access to new tables,
-- which made every query fail with "permission denied for table alerts".
-- RLS policies still restrict signed-in users to their own rows; anon gets no access.
grant select, insert, update, delete on public.alerts to authenticated;
grant select on public.alert_openings to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- The server (cron job, push subscriptions) uses the service role, which bypasses RLS.
grant select, insert, update, delete on public.alerts, public.alert_openings, public.push_subscriptions to service_role;
