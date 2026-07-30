-- Ensure every payment that is ready for verification or already completed
-- has a transaction date. Existing rows are repaired from metadata first,
-- then from their creation time when no explicit date was stored.

update public.payments
set paid_at = coalesce(
  case
    when nullif(metadata ->> 'paid_at', '') ~ '^\d{4}-\d{2}-\d{2}'
      then (metadata ->> 'paid_at')::timestamptz
    else null
  end,
  created_at,
  now()
)
where paid_at is null
  and status in ('pending_verification', 'completed');

alter table public.payments
  drop constraint if exists payments_paid_at_required_for_verification;

alter table public.payments
  add constraint payments_paid_at_required_for_verification
  check (
    status not in ('pending_verification', 'completed')
    or paid_at is not null
  );
