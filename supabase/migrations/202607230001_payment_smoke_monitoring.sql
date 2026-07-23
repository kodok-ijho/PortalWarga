insert into public.ipl_settings (key, value)
values
  (
    'monitoring.payment_smoke_config',
    jsonb_build_object(
      'enabled', true,
      'frequency', 'daily',
      'run_hour', 9,
      'timezone', 'Asia/Jakarta',
      'notification_email', 'denmas.dyudhiantoro@gmail.com',
      'notify_recovery', true
    )
  ),
  (
    'monitoring.payment_smoke_status',
    jsonb_build_object(
      'status', 'never',
      'checks', jsonb_build_array(),
      'notification_sent', false
    )
  )
on conflict (key) do nothing;
