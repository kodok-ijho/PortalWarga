-- Read-only verification after schema clone and before synthetic UAT seed.
-- Every result below must be zero. Configuration tables are excluded because
-- ordered migrations intentionally create non-PII baseline settings/categories.

select entity, row_count
from (
  select 'auth.users' as entity, count(*)::bigint as row_count from auth.users
  union all select 'public.uat_runs', count(*) from public.uat_runs
  union all select 'public.profiles', count(*) from public.profiles
  union all select 'public.units', count(*) from public.units
  union all select 'public.ipl_components', count(*) from public.ipl_components
  union all select 'public.ipl_bills', count(*) from public.ipl_bills
  union all select 'public.payments', count(*) from public.payments
  union all select 'public.expenses', count(*) from public.expenses
  union all select 'public.audit_logs', count(*) from public.audit_logs
  union all select 'public.events', count(*) from public.events
  union all select 'public.rsvp', count(*) from public.rsvp
  union all select 'public.forum_threads', count(*) from public.forum_threads
  union all select 'public.forum_posts', count(*) from public.forum_posts
  union all select 'public.event_members', count(*) from public.event_members
  union all select 'public.non_ipl_incomes', count(*) from public.non_ipl_incomes
  union all select 'public.email_notification_outbox', count(*) from public.email_notification_outbox
  union all select 'public.email_notification_attempts', count(*) from public.email_notification_attempts
  union all select 'public.email_notification_runs', count(*) from public.email_notification_runs
  union all select 'public.email_notification_replays', count(*) from public.email_notification_replays
  union all select 'public.email_notification_capture_anomalies', count(*) from public.email_notification_capture_anomalies
  union all select 'public.email_notification_incidents', count(*) from public.email_notification_incidents
  union all select 'storage.objects', count(*) from storage.objects
) counts
order by entity;
