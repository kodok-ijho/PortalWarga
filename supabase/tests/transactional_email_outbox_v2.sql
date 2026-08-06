-- Transactional email outbox v2 verification matrix.
-- Safe to run in SQL Editor: every mutation is rolled back at the end.

begin;

do $$
begin
  if has_table_privilege('anon', 'public.email_notification_outbox', 'SELECT')
     or has_table_privilege('authenticated', 'public.email_notification_outbox', 'SELECT') then
    raise exception 'FAIL: client role can read email outbox';
  end if;
  if has_function_privilege('anon', 'public.claim_email_notification_batch(text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_email_notification_batch(text,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL: client role can execute email claim RPC';
  end if;
  if not has_function_privilege('service_role', 'public.claim_email_notification_batch(text,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL: service_role cannot execute email claim RPC';
  end if;
end;
$$;

do $$
declare
  test_unit_id bigint;
  admin_id uuid := gen_random_uuid();
  resident_id uuid := gen_random_uuid();
  invalid_email_profile_id uuid := gen_random_uuid();
  bill_id uuid := gen_random_uuid();
  payment_id uuid := gen_random_uuid();
  test_outbox_id uuid;
  duplicate_id uuid;
  claimed public.email_notification_outbox%rowtype;
  replay_outbox_id uuid;
  replay_claim public.email_notification_outbox%rowtype;
  stale_outbox_id uuid;
  stale_claim public.email_notification_outbox%rowtype;
  outcome_ok boolean;
  reconciled_count integer;
  incident_state record;
begin
  insert into public.units(block, unit_number, is_occupied)
  values ('EMAIL-TEST', substr(gen_random_uuid()::text, 1, 8), true)
  returning id into test_unit_id;

  insert into public.profiles(
    id, google_sub, email, full_name, role, approval_status, is_active
  ) values (
    admin_id, 'email-test-admin-' || admin_id::text,
    'email-test-admin-' || admin_id::text || '@example.invalid',
    'Email Test Admin', 'admin', 'approved', true
  );

  insert into public.profiles(
    id, google_sub, email, full_name, role, unit_id, approval_status, is_active
  ) values (
    resident_id, 'email-test-resident-' || resident_id::text,
    'email-test-resident-' || resident_id::text || '@example.invalid',
    'Email Test Resident', 'warga', test_unit_id, 'approved', true
  );

  -- Invalid notification recipient must not abort the profile insert.
  insert into public.profiles(
    id, google_sub, email, full_name, role, approval_status, is_active
  ) values (
    invalid_email_profile_id, 'email-test-invalid-' || invalid_email_profile_id::text,
    'email-test-invalid', 'Email Test Invalid', 'admin', 'pending_approval', true
  );
  if not exists (select 1 from public.profiles where id = invalid_email_profile_id) then
    raise exception 'FAIL: fail-open profile insert was rolled back';
  end if;

  insert into public.ipl_bills(
    id, unit_id, resident_id, period, amount, late_fee, due_date, status, created_by
  ) values (
    bill_id, test_unit_id, resident_id, '2099-01', 100000, 0, '2099-01-31', 'pending', admin_id
  );

  insert into public.payments(
    id, ipl_bill_id, resident_id, amount, method, status, paid_at, recorded_by, metadata
  ) values (
    payment_id, bill_id, resident_id, 100000, 'cash', 'completed', now(), admin_id, '{}'::jsonb
  );

  if not exists (select 1 from public.payments where id = payment_id and recorded_by = admin_id) then
    raise exception 'FAIL: payment or recorded_by was not persisted';
  end if;

  test_outbox_id := public.enqueue_email_notification_v2(
    'email.test.claim:' || payment_id::text,
    'email.test', 'payment', payment_id, resident_id,
    'email-test-recipient@example.invalid', 'Email Test Recipient',
    jsonb_build_object('payment_id', payment_id), 'v2'
  );
  if test_outbox_id is null then
    raise exception 'FAIL: valid outbox row was not inserted';
  end if;

  duplicate_id := public.enqueue_email_notification_v2(
    'email.test.claim:' || payment_id::text,
    'email.test', 'payment', payment_id, resident_id,
    'email-test-recipient@example.invalid', 'Email Test Recipient',
    jsonb_build_object('payment_id', payment_id), 'v2'
  );
  if duplicate_id is not null then
    raise exception 'FAIL: dedupe insert returned a second row';
  end if;

  update public.email_notification_outbox
     set available_at = '-infinity'::timestamptz
   where id = test_outbox_id;

  select * into claimed
    from public.claim_email_notification_batch('email-test-worker', 1, 120);
  if claimed.id is distinct from test_outbox_id
     or claimed.status <> 'processing'
     or claimed.lease_token is null then
    raise exception 'FAIL: atomic claim did not return the expected leased row';
  end if;

  outcome_ok := public.record_email_notification_outcome(
    claimed.id, gen_random_uuid(), 'email-test-worker', 'sent',
    null, null, 'provider-wrong-token', 'confirmed_sent', null
  );
  if outcome_ok then
    raise exception 'FAIL: incorrect lease token was accepted';
  end if;

  outcome_ok := public.record_email_notification_outcome(
    claimed.id, claimed.lease_token, 'email-test-worker', 'sent',
    null, null, 'provider-test-id', 'confirmed_sent', null
  );
  if not outcome_ok then
    raise exception 'FAIL: correct lease outcome was rejected';
  end if;

  if not exists (
    select 1 from public.email_notification_outbox
     where id = claimed.id and status = 'sent' and provider_message_id = 'provider-test-id'
  ) then
    raise exception 'FAIL: sent outcome was not persisted';
  end if;

  if not exists (
    select 1 from public.email_notification_attempts
     where outbox_id = claimed.id and attempt_no = 1 and result = 'sent'
  ) then
    raise exception 'FAIL: attempt history was not persisted';
  end if;

  replay_outbox_id := public.enqueue_email_notification_v2(
    'email.test.replay:' || payment_id::text,
    'email.test', 'payment', payment_id, resident_id,
    'email-test-replay@example.invalid', 'Email Test Replay',
    jsonb_build_object('payment_id', payment_id), 'v2'
  );
  update public.email_notification_outbox set available_at = '-infinity'::timestamptz where id = replay_outbox_id;
  select * into replay_claim from public.claim_email_notification_batch('email-test-replay-worker', 1, 120);
  outcome_ok := public.record_email_notification_outcome(
    replay_claim.id, replay_claim.lease_token, 'email-test-replay-worker', 'dead_letter',
    'TEST_FAILURE', 'Synthetic terminal failure', null, 'confirmed_not_sent', null
  );
  if not outcome_ok then
    raise exception 'FAIL: dead-letter outcome was rejected';
  end if;
  if public.replay_email_notification(replay_claim.id, admin_id, 'test replay must be confirmed', false) then
    raise exception 'FAIL: replay without confirmed-not-sent was accepted';
  end if;
  if not public.replay_email_notification(replay_claim.id, admin_id, 'test replay after Sent verification', true) then
    raise exception 'FAIL: safe replay was rejected';
  end if;
  if not exists (select 1 from public.email_notification_replays where outbox_id = replay_claim.id and actor_id = admin_id) then
    raise exception 'FAIL: replay audit was not stored';
  end if;

  stale_outbox_id := public.enqueue_email_notification_v2(
    'email.test.stale:' || payment_id::text,
    'email.test', 'payment', payment_id, resident_id,
    'email-test-stale@example.invalid', 'Email Test Stale',
    jsonb_build_object('payment_id', payment_id), 'v2'
  );
  update public.email_notification_outbox
     set status = 'processing', claimed_by = 'crashed-worker',
         lease_token = gen_random_uuid(), claimed_at = now() - interval '10 minutes',
         lease_expires_at = '-infinity'::timestamptz
   where id = stale_outbox_id;
  select * into stale_claim from public.claim_stale_email_notification_batch('email-test-recovery', 1, 120);
  if stale_claim.id is distinct from stale_outbox_id
     or stale_claim.claimed_by <> 'email-test-recovery'
     or stale_claim.reconciliation_status <> 'unknown' then
    raise exception 'FAIL: stale lease was not reclaimed for Sent reconciliation';
  end if;
  outcome_ok := public.record_email_notification_outcome(
    stale_claim.id, stale_claim.lease_token, stale_claim.claimed_by, 'retry',
    'STALE_LEASE_RECOVERED', 'Not found in Sent', null, 'confirmed_not_sent', now() + interval '1 minute'
  );
  if not outcome_ok then
    raise exception 'FAIL: stale lease could not be released after reconciliation';
  end if;

  select * into incident_state from public.update_email_notification_incident(
    'email-test-incident', 'test', true, '{"test":true}'::jsonb, 3600
  );
  if not incident_state.should_alert then
    raise exception 'FAIL: new incident did not request an alert';
  end if;
  if not public.ack_email_notification_incident_delivery('email-test-incident', false) then
    raise exception 'FAIL: incident alert acknowledgment failed';
  end if;
  select * into incident_state from public.update_email_notification_incident(
    'email-test-incident', 'test', true, '{"test":true}'::jsonb, 3600
  );
  if incident_state.should_alert then
    raise exception 'FAIL: incident cooldown did not suppress a repeated alert';
  end if;
  select * into incident_state from public.update_email_notification_incident(
    'email-test-incident', 'test', false, '{"test":false}'::jsonb, 3600
  );
  if not incident_state.should_recover then
    raise exception 'FAIL: resolved incident did not request a recovery notification';
  end if;
  if not public.ack_email_notification_incident_delivery('email-test-incident', true) then
    raise exception 'FAIL: recovery notification acknowledgment failed';
  end if;

  reconciled_count := public.reconcile_payment_email_notification(payment_id, now() - interval '1 hour', 'v1');
  if reconciled_count <> 0 then
    raise exception 'FAIL: reconciler created duplicates for an already captured payment';
  end if;

  raise notice 'PASS: fail-open, actor, dedupe, claim/lease, stale recovery, outcome, attempt, safe replay, incident cooldown/recovery, and reconciliation checks succeeded';
end;
$$;

rollback;
