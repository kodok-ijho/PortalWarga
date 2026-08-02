-- Event finance RLS/IDOR validation matrix.
-- Run only in a disposable local/staging database after applying migrations.
-- This file is intentionally read-only except for wrapped test data inside a transaction.

begin;

create extension if not exists pgcrypto;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_bendahara uuid := gen_random_uuid();
  v_treasurer_a uuid := gen_random_uuid();
  v_coord_a uuid := gen_random_uuid();
  v_warga uuid := gen_random_uuid();
  v_event_a uuid := gen_random_uuid();
  v_event_b uuid := gen_random_uuid();
  v_income_a uuid;
  v_expense_a uuid;
begin
  insert into public.profiles (id, google_sub, email, full_name, role, approval_status, is_active)
  values
    (v_admin, 'evt-admin', 'evt-admin@example.invalid', 'Event Admin', 'admin', 'approved', true),
    (v_bendahara, 'evt-bendahara', 'evt-bendahara@example.invalid', 'Event Bendahara', 'bendahara', 'approved', true),
    (v_treasurer_a, 'evt-treasurer-a', 'evt-treasurer-a@example.invalid', 'Event Treasurer A', 'warga', 'approved', true),
    (v_coord_a, 'evt-coord-a', 'evt-coord-a@example.invalid', 'Event Coordinator A', 'warga', 'approved', true),
    (v_warga, 'evt-warga', 'evt-warga@example.invalid', 'Event Warga', 'warga', 'approved', true);

  insert into public.events (id, title, event_code, event_date, status)
  values
    (v_event_a, 'Event A', 'EVT-RLS-A', now(), 'active'),
    (v_event_b, 'Event B', 'EVT-RLS-B', now(), 'active');

  insert into public.event_members (event_id, profile_id, assignment_role, assigned_by)
  values
    (v_event_a, v_treasurer_a, 'event_treasurer', v_admin),
    (v_event_a, v_coord_a, 'coordinator_member', v_admin);

  perform set_config('request.jwt.claim.sub', v_treasurer_a::text, true);

  if not public.can_view_event_finance(v_event_a) then
    raise exception 'event treasurer should view assigned event';
  end if;

  if not public.can_create_event_finance(v_event_a) then
    raise exception 'event treasurer should create assigned event finance';
  end if;

  if public.can_view_event_finance(v_event_b) then
    raise exception 'event treasurer must not view unassigned event';
  end if;

  if public.can_create_event_finance(v_event_b) then
    raise exception 'event treasurer must not create finance for unassigned event';
  end if;

  perform set_config('request.jwt.claim.sub', v_coord_a::text, true);

  if not public.can_view_event_finance(v_event_a) then
    raise exception 'coordinator should view assigned event';
  end if;

  if public.can_create_event_finance(v_event_a) then
    raise exception 'coordinator must not create event finance';
  end if;

  perform set_config('request.jwt.claim.sub', v_bendahara::text, true);

  insert into public.non_ipl_incomes (
    income_date, scope, event_id, category, source_name, amount, payment_method, description, recorded_by
  )
  values (
    current_date, 'event', v_event_a, 'Sponsor', 'Sponsor A', 100000, 'other', 'RLS test income', v_bendahara
  )
  returning id into v_income_a;

  insert into public.expenses (
    expense_date, scope, event_id, category, amount, description, recorded_by
  )
  values (
    current_date, 'event', v_event_a, 'Logistik', 50000, 'RLS test expense', v_bendahara
  )
  returning id into v_expense_a;

  update public.events
  set status = 'archived'
  where id = v_event_a;

  perform set_config('request.jwt.claim.sub', v_treasurer_a::text, true);

  if public.can_create_event_finance(v_event_a) then
    raise exception 'archived event must reject new event-scoped transactions';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  update public.non_ipl_incomes
  set deleted_at = now(), deleted_by = v_admin
  where id = v_income_a;

  update public.expenses
  set deleted_at = now(), deleted_by = v_admin
  where id = v_expense_a;

  raise notice 'Event finance RLS matrix passed.';
end $$;

rollback;
