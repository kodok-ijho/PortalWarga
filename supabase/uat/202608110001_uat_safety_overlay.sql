-- UAT ONLY - DO NOT APPLY TO PRODUCTION.
-- Apply only after all ordered files in supabase/migrations have succeeded on
-- the verified empty staging project. This file contains no production data.

begin;

insert into public.ipl_settings (key, value)
values (
  'uat.environment',
  jsonb_build_object(
    'app_env', 'uat',
    'is_demo', true,
    'email_delivery', 'smtp_sandbox_only',
    'production_data_imported', false
  )
)
on conflict (key) do update
set value = excluded.value;

update public.ipl_settings
set value = jsonb_set(
  coalesce(value, '{}'::jsonb),
  '{enabled}',
  'false'::jsonb,
  true
)
where key = 'monitoring.payment_smoke_config';

commit;
