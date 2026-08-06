-- Portal Warga Palm Village - transactional email outbox v2
--
-- This migration is additive and is intentionally separate from the v1
-- prototype. It makes business mutations independent from email delivery,
-- adds an atomic claim/lease API, records attempts, and provides bounded
-- reconciliation helpers. The dispatcher remains responsible for Gmail and
-- for checking Sent by deterministic Message-ID before an ambiguous retry.

alter table if exists public.payments
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null;

alter table if exists public.profiles
  add column if not exists notification_approval_transition_at timestamptz;

alter table if exists public.payments
  add column if not exists notification_status_transition_at timestamptz;

update public.profiles
   set notification_approval_transition_at = coalesce(approved_at, rejected_at, updated_at)
 where approval_status in ('approved', 'rejected')
   and notification_approval_transition_at is null;

update public.payments
   set notification_status_transition_at = coalesce(verified_at, paid_at, updated_at)
 where status in ('completed', 'rejected')
   and notification_status_transition_at is null;

create or replace function public.stamp_profile_notification_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.approval_status in ('approved'::public.approval_status, 'rejected'::public.approval_status) then
      new.notification_approval_transition_at := clock_timestamp();
    end if;
  elsif new.approval_status is distinct from old.approval_status then
    new.notification_approval_transition_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create or replace function public.stamp_payment_notification_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('completed'::public.payment_status, 'rejected'::public.payment_status) then
      new.notification_status_transition_at := clock_timestamp();
    end if;
  elsif new.status is distinct from old.status then
    new.notification_status_transition_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_profile_notification_transition on public.profiles;
create trigger trg_stamp_profile_notification_transition
  before insert or update of approval_status on public.profiles
  for each row execute function public.stamp_profile_notification_transition();

drop trigger if exists trg_stamp_payment_notification_transition on public.payments;
create trigger trg_stamp_payment_notification_transition
  before insert or update of status on public.payments
  for each row execute function public.stamp_payment_notification_transition();

create index if not exists idx_payments_recorded_by
  on public.payments(recorded_by)
  where recorded_by is not null;

alter table if exists public.email_notification_outbox
  add column if not exists template_version text not null default 'v1',
  add column if not exists message_id text,
  add column if not exists provider_message_id text,
  add column if not exists error_class text,
  add column if not exists claimed_by text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists terminal_at timestamptz,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciliation_status text not null default 'not_checked',
  add column if not exists failure_alerted_at timestamptz;

alter table if exists public.email_notification_outbox
  drop constraint if exists email_notification_outbox_status_check;

alter table if exists public.email_notification_outbox
  add constraint email_notification_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter'));

alter table if exists public.email_notification_outbox
  drop constraint if exists email_notification_outbox_reconciliation_status_check;

alter table if exists public.email_notification_outbox
  add constraint email_notification_outbox_reconciliation_status_check
  check (reconciliation_status in ('not_checked', 'confirmed_sent', 'confirmed_not_sent', 'unknown'));

create unique index if not exists uq_email_notification_outbox_message_id
  on public.email_notification_outbox(message_id)
  where message_id is not null;

create index if not exists idx_email_notification_outbox_claims
  on public.email_notification_outbox(status, lease_expires_at)
  where status = 'processing';

create index if not exists idx_email_notification_outbox_reconcile
  on public.email_notification_outbox(reconciliation_status, updated_at)
  where status = 'processing';

create index if not exists idx_email_notification_outbox_terminal
  on public.email_notification_outbox(status, terminal_at)
  where status in ('failed', 'dead_letter');

create table if not exists public.email_notification_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.email_notification_outbox(id) on delete cascade,
  attempt_no integer not null,
  worker_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text not null check (result in ('sent', 'retry', 'dead_letter', 'ambiguous', 'reconciled')),
  error_class text,
  error_message text,
  provider_message_id text,
  reconciliation_status text,
  created_at timestamptz not null default now(),
  unique (outbox_id, attempt_no)
);

create index if not exists idx_email_notification_attempts_outbox
  on public.email_notification_attempts(outbox_id, attempt_no desc);

create table if not exists public.email_notification_runs (
  component text primary key,
  worker_id text,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_notification_replays (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.email_notification_outbox(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  confirmed_not_sent boolean not null,
  previous_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_notification_replays_outbox
  on public.email_notification_replays(outbox_id, created_at desc);

create table if not exists public.email_notification_capture_anomalies (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  error_class text,
  error_message text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.email_notification_incidents (
  incident_key text primary key,
  incident_type text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_alerted_at timestamptz,
  recovered_at timestamptz,
  recovery_notified_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table if exists public.email_notification_incidents
  add column if not exists recovery_notified_at timestamptz;

create index if not exists idx_email_notification_capture_anomalies_open
  on public.email_notification_capture_anomalies(detected_at)
  where resolved_at is null;

alter table public.email_notification_attempts enable row level security;
alter table public.email_notification_runs enable row level security;
alter table public.email_notification_replays enable row level security;
alter table public.email_notification_capture_anomalies enable row level security;
alter table public.email_notification_incidents enable row level security;

revoke all on public.email_notification_attempts from anon, authenticated;
revoke all on public.email_notification_runs from anon, authenticated;
revoke all on public.email_notification_replays from anon, authenticated;
revoke all on public.email_notification_capture_anomalies from anon, authenticated;
revoke all on public.email_notification_incidents from anon, authenticated;
grant select, insert, update on public.email_notification_attempts to service_role;
grant select, insert, update on public.email_notification_runs to service_role;
grant select, insert on public.email_notification_replays to service_role;
grant select, insert, update on public.email_notification_capture_anomalies to service_role;
grant select, insert, update on public.email_notification_incidents to service_role;
grant delete on public.email_notification_attempts to service_role;
grant delete on public.email_notification_runs to service_role;
grant delete on public.email_notification_replays to service_role;
grant delete on public.email_notification_capture_anomalies to service_role;
grant delete on public.email_notification_incidents to service_role;

create or replace function public.email_notification_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.email_notification_try_uuid(text) from public, anon, authenticated;

create or replace function public.email_notification_message_id(p_dedupe_key text, p_template_version text default 'v1')
returns text
language sql
immutable
set search_path = public
as $$
  -- gmail.com is the currently approved sender domain. If the sender moves
  -- to a custom domain, update this function with the sender deployment.
  select '<' || md5(coalesce(p_dedupe_key, '') || ':' || coalesce(p_template_version, 'v1'))
      || '@gmail.com>';
$$;

revoke all on function public.email_notification_message_id(text, text) from public, anon, authenticated;

create or replace function public.enqueue_email_notification_v2(
  p_dedupe_key text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_recipient_id uuid,
  p_recipient_email text,
  p_recipient_name text,
  p_payload jsonb,
  p_template_version text default 'v1'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  normalized_email text := lower(trim(coalesce(p_recipient_email, '')));
  normalized_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
begin
  if normalized_key is null
     or normalized_email = ''
     or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return null;
  end if;

  begin
    insert into public.email_notification_outbox (
      dedupe_key, event_type, entity_type, entity_id, recipient_id,
      recipient_email, recipient_name, payload, template_version, message_id
    ) values (
      normalized_key, p_event_type, p_entity_type, p_entity_id, p_recipient_id,
      normalized_email, nullif(trim(p_recipient_name), ''), coalesce(p_payload, '{}'::jsonb),
      coalesce(nullif(trim(p_template_version), ''), 'v1'),
      public.email_notification_message_id(normalized_key, coalesce(nullif(trim(p_template_version), ''), 'v1'))
    )
    on conflict (dedupe_key) do nothing
    returning id into inserted_id;
  exception when others then
    -- Fail-open is deliberate: callers must not lose a successful business
    -- mutation because an email row, index, or payload was malformed.
    begin
      insert into public.email_notification_capture_anomalies (
        event_type, entity_type, entity_id, dedupe_key, error_class, error_message, metadata
      ) values (
        p_event_type, p_entity_type, p_entity_id, normalized_key,
        'OUTBOX_ENQUEUE_FAILED', 'Transactional email outbox insert failed.',
        jsonb_build_object('recipient_id', p_recipient_id, 'template_version', p_template_version)
      );
    exception when others then
      null;
    end;
    return null;
  end;

  begin
    if inserted_id is not null or exists (select 1 from public.email_notification_outbox where dedupe_key = normalized_key) then
      update public.email_notification_capture_anomalies
         set resolved_at = now()
       where dedupe_key = normalized_key and resolved_at is null;
    end if;
  exception when others then
    null;
  end;

  return inserted_id;
end;
$$;

revoke all on function public.enqueue_email_notification_v2(text, text, text, uuid, uuid, text, text, jsonb, text)
  from public, anon, authenticated;

create or replace function public.claim_email_notification_batch(
  p_worker_id text,
  p_batch_size integer default 50,
  p_lease_seconds integer default 300
)
returns setof public.email_notification_outbox
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
      from public.email_notification_outbox
     where status = 'pending'
       and available_at <= now()
       and nullif(trim(coalesce(p_worker_id, '')), '') is not null
     order by available_at asc, created_at asc, id asc
     limit greatest(1, least(coalesce(p_batch_size, 50), 500))
     for update skip locked
  ), claimed as (
    update public.email_notification_outbox o
       set status = 'processing',
           claimed_by = nullif(trim(coalesce(p_worker_id, '')), ''),
           lease_token = gen_random_uuid(),
           claimed_at = now(),
           lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600))),
           updated_at = now()
      from candidates c
     where o.id = c.id
     returning o.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_email_notification_batch(text, integer, integer) from public, anon, authenticated;

create or replace function public.claim_stale_email_notification_batch(
  p_worker_id text,
  p_batch_size integer default 25,
  p_lease_seconds integer default 300
)
returns setof public.email_notification_outbox
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
      from public.email_notification_outbox
     where status = 'processing'
       and lease_expires_at < now()
       and nullif(trim(coalesce(p_worker_id, '')), '') is not null
     order by lease_expires_at asc, id asc
     limit greatest(1, least(coalesce(p_batch_size, 25), 250))
     for update skip locked
  ), claimed as (
    update public.email_notification_outbox o
       set claimed_by = nullif(trim(coalesce(p_worker_id, '')), ''),
           lease_token = gen_random_uuid(),
           claimed_at = now(),
           lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600))),
           reconciliation_status = 'unknown',
           updated_at = now()
      from candidates c
     where o.id = c.id
     returning o.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_stale_email_notification_batch(text, integer, integer)
  from public, anon, authenticated;

create or replace function public.record_email_notification_outcome(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_worker_id text,
  p_result text,
  p_error_class text default null,
  p_error_message text default null,
  p_provider_message_id text default null,
  p_reconciliation_status text default 'not_checked',
  p_available_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempt integer;
  next_status text;
  next_available timestamptz;
  updated_id uuid;
begin
  if p_result not in ('sent', 'retry', 'dead_letter', 'ambiguous', 'reconciled') then
    return false;
  end if;

  next_status := case
    when p_result in ('sent', 'reconciled') then 'sent'
    when p_result = 'dead_letter' then 'dead_letter'
    else 'pending'
  end;
  next_available := coalesce(p_available_at, now());

  update public.email_notification_outbox
     set status = next_status,
         attempts = attempts + 1,
         last_attempt_at = now(),
         sent_at = case when next_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
         terminal_at = case when next_status = 'dead_letter' then now() else terminal_at end,
         available_at = case when next_status = 'pending' then next_available else available_at end,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         error_class = nullif(trim(p_error_class), ''),
         last_error = nullif(left(coalesce(p_error_message, ''), 1000), ''),
         reconciliation_status = coalesce(nullif(p_reconciliation_status, ''), reconciliation_status),
         reconciled_at = case when p_result in ('reconciled', 'ambiguous') then now() else reconciled_at end,
         claimed_by = null,
         lease_token = null,
         lease_expires_at = null,
         updated_at = now()
   where id = p_outbox_id
     and status = 'processing'
     and lease_token = p_lease_token
     and claimed_by = nullif(trim(coalesce(p_worker_id, '')), '')
   returning id, attempts into updated_id, current_attempt;

  if updated_id is null then
    return false;
  end if;

  insert into public.email_notification_attempts (
    outbox_id, attempt_no, worker_id, finished_at, result, error_class,
    error_message, provider_message_id, reconciliation_status
  ) values (
    updated_id, current_attempt, p_worker_id, now(),
    case when p_result in ('sent', 'reconciled') then 'sent'
         when p_result = 'dead_letter' then 'dead_letter'
         when p_result = 'ambiguous' then 'ambiguous'
         else 'retry' end,
    nullif(trim(p_error_class), ''), left(nullif(trim(p_error_message), ''), 1000),
    p_provider_message_id, p_reconciliation_status
  )
  on conflict (outbox_id, attempt_no) do nothing;

  return true;
end;
$$;

revoke all on function public.record_email_notification_outcome(uuid, uuid, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;

create or replace function public.replay_email_notification(
  p_outbox_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_confirmed_not_sent boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_status text;
begin
  if coalesce(p_confirmed_not_sent, false) is not true
     or length(trim(coalesce(p_reason, ''))) < 8 then
    return false;
  end if;

  select status into previous_status
    from public.email_notification_outbox
   where id = p_outbox_id
     and status in ('failed', 'dead_letter')
   for update;
  if not found then
    return false;
  end if;

  insert into public.email_notification_replays (
    outbox_id, actor_id, reason, confirmed_not_sent, previous_status
  ) values (
    p_outbox_id, p_actor_id, trim(p_reason), true, previous_status
  );

  update public.email_notification_outbox
     set status = 'pending', attempts = 0, available_at = now(),
         claimed_at = null, claimed_by = null, lease_token = null,
         lease_expires_at = null, terminal_at = null,
         reconciliation_status = 'confirmed_not_sent', reconciled_at = now(),
         failure_alerted_at = null, error_class = null, last_error = null,
         updated_at = now()
   where id = p_outbox_id;
  return true;
end;
$$;

revoke all on function public.replay_email_notification(uuid, uuid, text, boolean)
  from public, anon, authenticated;

create or replace function public.mark_email_notification_run(
  p_component text,
  p_worker_id text,
  p_success boolean,
  p_metrics jsonb default '{}'::jsonb,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_notification_runs (
    component, worker_id, last_started_at, last_finished_at,
    last_success_at, last_error, last_metrics, updated_at
  ) values (
    p_component, p_worker_id, now(), now(),
    case when p_success then now() else null end,
    nullif(left(trim(coalesce(p_error, '')), 1000), ''),
    coalesce(p_metrics, '{}'::jsonb), now()
  )
  on conflict (component) do update set
    worker_id = excluded.worker_id,
    last_started_at = excluded.last_started_at,
    last_finished_at = excluded.last_finished_at,
    last_success_at = case when p_success then excluded.last_success_at else email_notification_runs.last_success_at end,
    last_error = excluded.last_error,
    last_metrics = excluded.last_metrics,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.mark_email_notification_run(text, text, boolean, jsonb, text)
  from public, anon, authenticated;

create or replace function public.update_email_notification_incident(
  p_incident_key text,
  p_incident_type text,
  p_active boolean,
  p_details jsonb default '{}'::jsonb,
  p_cooldown_seconds integer default 3600
)
returns table(should_alert boolean, should_recover boolean, incident_status text, incident_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.email_notification_incidents%rowtype;
  normalized_key text := nullif(trim(coalesce(p_incident_key, '')), '');
  do_alert boolean := false;
  do_recover boolean := false;
begin
  if normalized_key is null then
    return query select false, false, 'invalid'::text, null::text;
    return;
  end if;

  select * into current_row
    from public.email_notification_incidents i
   where i.incident_key = normalized_key
   for update;

  if coalesce(p_active, false) then
    if not found then
      insert into public.email_notification_incidents (
        incident_key, incident_type, status, first_seen_at, last_seen_at,
        last_alerted_at, recovery_notified_at, details, updated_at
      ) values (
        normalized_key, coalesce(nullif(trim(p_incident_type), ''), 'email_pipeline'),
        'open', now(), now(), null, null, coalesce(p_details, '{}'::jsonb), now()
      );
      do_alert := true;
    else
      do_alert := current_row.status = 'resolved'
        or current_row.last_alerted_at is null
        or current_row.last_alerted_at <= now() - make_interval(secs => greatest(60, coalesce(p_cooldown_seconds, 3600)));
      update public.email_notification_incidents
         set incident_type = coalesce(nullif(trim(p_incident_type), ''), incident_type),
             status = 'open',
             first_seen_at = case when current_row.status = 'resolved' then now() else first_seen_at end,
             last_seen_at = now(),
             last_alerted_at = case when current_row.status = 'resolved' then null else last_alerted_at end,
             recovered_at = null,
             recovery_notified_at = null,
             details = coalesce(p_details, '{}'::jsonb),
             updated_at = now()
       where email_notification_incidents.incident_key = normalized_key;
    end if;
    return query select do_alert, false, 'open'::text, normalized_key;
    return;
  end if;

  if found and current_row.status = 'open' then
    update public.email_notification_incidents
       set status = 'resolved', recovered_at = now(), last_seen_at = now(),
           recovery_notified_at = null,
           details = coalesce(p_details, details), updated_at = now()
     where email_notification_incidents.incident_key = normalized_key;
    do_recover := true;
  elsif found and current_row.status = 'resolved'
        and current_row.recovered_at is not null
        and current_row.recovery_notified_at is null then
    do_recover := true;
  end if;
  return query select false, do_recover, case when do_recover then 'resolved' else coalesce(current_row.status, 'none') end, normalized_key;
end;
$$;

revoke all on function public.update_email_notification_incident(text, text, boolean, jsonb, integer)
  from public, anon, authenticated;

create or replace function public.ack_email_notification_incident_delivery(
  p_incident_key text,
  p_recovery boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.email_notification_incidents
     set last_alerted_at = case when not coalesce(p_recovery, false) then now() else last_alerted_at end,
         recovery_notified_at = case when coalesce(p_recovery, false) then now() else recovery_notified_at end,
         updated_at = now()
   where incident_key = nullif(trim(coalesce(p_incident_key, '')), '');
  return found;
end;
$$;

revoke all on function public.ack_email_notification_incident_delivery(text, boolean)
  from public, anon, authenticated;

create or replace function public.cleanup_email_notification_outbox(
  p_sent_before timestamptz,
  p_terminal_before timestamptz,
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with candidates as (
    select id
      from public.email_notification_outbox
     where (status = 'sent' and sent_at < p_sent_before)
        or (status in ('failed', 'dead_letter') and terminal_at < p_terminal_before)
     order by coalesce(sent_at, terminal_at, updated_at) asc
     limit greatest(1, least(coalesce(p_batch_size, 500), 5000))
     for update skip locked
  ), deleted as (
    delete from public.email_notification_outbox o
     using candidates c
     where o.id = c.id
       and o.status <> 'processing'
     returning o.id
  )
  select count(*) into deleted_count from deleted;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_email_notification_outbox(timestamptz, timestamptz, integer)
  from public, anon, authenticated;

-- This helper is intentionally explicit about the eligible time window. It
-- never backfills all historical records unless the caller supplies such a
-- range and chooses to do so.
create or replace function public.reconcile_profile_email_notification(
  p_profile_id uuid,
  p_since timestamptz,
  p_template_version text default 'v1'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  admin_row record;
  actor_id uuid;
  actor_email text;
  created_count integer := 0;
  queued_id uuid;
begin
  select * into target from public.profiles where id = p_profile_id;
  if not found then return 0; end if;

  if target.created_at >= coalesce(p_since, '-infinity'::timestamptz) then
    queued_id := public.enqueue_email_notification_v2(
      'profile.registered.user:' || target.id::text || ':' || lower(target.email),
      'profile.registered.user', 'profile', target.id, target.id, target.email,
      target.full_name,
      jsonb_build_object('full_name', target.full_name, 'email', target.email,
        'role', target.role::text, 'approval_status', target.approval_status::text,
        'created_at', target.created_at), p_template_version);
    if queued_id is not null then created_count := created_count + 1; end if;

    for admin_row in
      select id, email, full_name from public.profiles
       where role = 'admin'::public.user_role
         and approval_status = 'approved'::public.approval_status
         and is_active = true and id <> target.id
    loop
      queued_id := public.enqueue_email_notification_v2(
        'profile.registered.admin:' || target.id::text || ':' || lower(admin_row.email),
        'profile.registered.admin', 'profile', target.id, admin_row.id,
        admin_row.email, admin_row.full_name,
        jsonb_build_object('full_name', target.full_name, 'email', target.email,
          'role', target.role::text, 'approval_status', target.approval_status::text,
          'created_at', target.created_at), p_template_version);
      if queued_id is not null then created_count := created_count + 1; end if;
    end loop;
  end if;

  if coalesce(target.notification_approval_transition_at, '-infinity'::timestamptz)
       >= coalesce(p_since, '-infinity'::timestamptz) then
    actor_id := case when target.approval_status = 'approved'::public.approval_status then target.approved_by
                     when target.approval_status = 'rejected'::public.approval_status then target.rejected_by
                     else null end;
    select email into actor_email from public.profiles where id = actor_id;
    queued_id := public.enqueue_email_notification_v2(
      'profile.verification.user:' || target.id::text || ':' || target.approval_status::text || ':'
        || extract(epoch from target.notification_approval_transition_at)::text,
      'profile.verification.user', 'profile', target.id, target.id, target.email,
      target.full_name,
      jsonb_build_object('full_name', target.full_name, 'email', target.email,
        'role', target.role::text, 'approval_status', target.approval_status::text,
        'approval_note', target.approval_note, 'approved_at', target.approved_at,
        'rejected_at', target.rejected_at), p_template_version);
    if queued_id is not null then created_count := created_count + 1; end if;

    if actor_id is not null and actor_email is not null and actor_email is distinct from target.email then
      queued_id := public.enqueue_email_notification_v2(
        'profile.verification.actor:' || target.id::text || ':' || target.approval_status::text || ':'
          || extract(epoch from target.notification_approval_transition_at)::text || ':' || actor_id::text,
        'profile.verification.actor', 'profile', target.id, actor_id, actor_email, null,
        jsonb_build_object('full_name', target.full_name, 'email', target.email,
          'approval_status', target.approval_status::text, 'approval_note', target.approval_note), p_template_version);
      if queued_id is not null then created_count := created_count + 1; end if;
    end if;
  end if;
  return created_count;
exception when others then
  return created_count;
end;
$$;

revoke all on function public.reconcile_profile_email_notification(uuid, timestamptz, text)
  from public, anon, authenticated;

create or replace function public.reconcile_payment_email_notification(
  p_payment_id uuid,
  p_since timestamptz,
  p_template_version text default 'v1'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  bill_row record;
  resident_row record;
  actor_row record;
  staff_row record;
  created_count integer := 0;
  queued_id uuid;
begin
  select * into payment_row from public.payments where id = p_payment_id;
  if not found then return 0; end if;
  if payment_row.created_at < coalesce(p_since, '-infinity'::timestamptz)
     and payment_row.updated_at < coalesce(p_since, '-infinity'::timestamptz) then
    return 0;
  end if;

  select b.period, b.unit_id, u.block, u.unit_number
    into bill_row from public.ipl_bills b left join public.units u on u.id = b.unit_id
   where b.id = payment_row.ipl_bill_id;
  select id, email, full_name into resident_row from public.profiles
   where id = coalesce(payment_row.resident_id,
     (select resident_id from public.ipl_bills where id = payment_row.ipl_bill_id));

  if payment_row.created_at >= coalesce(p_since, '-infinity'::timestamptz) then
    if resident_row.email is not null then
      queued_id := public.enqueue_email_notification_v2(
        'payment.recorded.resident:' || payment_row.id::text || ':' || lower(resident_row.email),
        'payment.recorded.resident', 'payment', payment_row.id, resident_row.id,
        resident_row.email, resident_row.full_name,
        jsonb_build_object('payment_id', payment_row.id, 'period', bill_row.period,
          'unit_label', concat_ws('/', bill_row.block, bill_row.unit_number),
          'amount', payment_row.amount, 'method', payment_row.method::text,
          'status', payment_row.status::text, 'paid_at', payment_row.paid_at,
          'created_at', payment_row.created_at), p_template_version);
      if queued_id is not null then created_count := created_count + 1; end if;
    end if;
    if payment_row.recorded_by is not null then
      select id, email, full_name into actor_row from public.profiles where id = payment_row.recorded_by;
      if actor_row.email is not null then
        queued_id := public.enqueue_email_notification_v2(
          'payment.recorded.actor:' || payment_row.id::text || ':' || actor_row.id::text,
          'payment.recorded.actor', 'payment', payment_row.id, actor_row.id,
          actor_row.email, actor_row.full_name,
          jsonb_build_object('payment_id', payment_row.id, 'resident_name', resident_row.full_name,
            'period', bill_row.period, 'amount', payment_row.amount,
            'method', payment_row.method::text, 'status', payment_row.status::text), p_template_version);
        if queued_id is not null then created_count := created_count + 1; end if;
      end if;
    end if;
  end if;

  if payment_row.status = 'pending_verification' then
    for staff_row in
      select id, email, full_name from public.profiles
       where role in ('admin'::public.user_role, 'bendahara'::public.user_role)
         and approval_status = 'approved'::public.approval_status and is_active = true
         and (resident_row.email is null or email <> resident_row.email)
    loop
      queued_id := public.enqueue_email_notification_v2(
        'payment.recorded.staff:' || payment_row.id::text || ':' || lower(staff_row.email),
        'payment.recorded.staff', 'payment', payment_row.id, staff_row.id,
        staff_row.email, staff_row.full_name,
        jsonb_build_object('payment_id', payment_row.id, 'resident_name', resident_row.full_name,
          'period', bill_row.period, 'amount', payment_row.amount,
          'method', payment_row.method::text, 'status', payment_row.status::text), p_template_version);
      if queued_id is not null then created_count := created_count + 1; end if;
    end loop;
  end if;

  if coalesce(payment_row.notification_status_transition_at, '-infinity'::timestamptz)
       >= coalesce(p_since, '-infinity'::timestamptz)
     and payment_row.status in ('completed'::public.payment_status, 'rejected'::public.payment_status) then
    if resident_row.email is not null then
      queued_id := public.enqueue_email_notification_v2(
        'payment.verification.resident:' || payment_row.id::text || ':' || payment_row.status::text || ':'
          || extract(epoch from payment_row.notification_status_transition_at)::text || ':' || lower(resident_row.email),
        'payment.verification.resident', 'payment', payment_row.id, resident_row.id,
        resident_row.email, resident_row.full_name,
        jsonb_build_object('payment_id', payment_row.id, 'period', bill_row.period,
          'unit_label', concat_ws('/', bill_row.block, bill_row.unit_number),
          'amount', payment_row.amount, 'method', payment_row.method::text,
          'status', payment_row.status::text, 'verification_note', payment_row.verification_note,
          'verified_at', payment_row.verified_at), p_template_version);
      if queued_id is not null then created_count := created_count + 1; end if;
    end if;
    if payment_row.verified_by is not null then
      select id, email, full_name into actor_row from public.profiles where id = payment_row.verified_by;
      if actor_row.email is not null and actor_row.email is distinct from resident_row.email then
        queued_id := public.enqueue_email_notification_v2(
          'payment.verification.actor:' || payment_row.id::text || ':' || payment_row.status::text || ':'
            || extract(epoch from payment_row.notification_status_transition_at)::text || ':' || actor_row.id::text,
          'payment.verification.actor', 'payment', payment_row.id, actor_row.id,
          actor_row.email, actor_row.full_name,
          jsonb_build_object('payment_id', payment_row.id, 'resident_name', resident_row.full_name,
            'period', bill_row.period, 'amount', payment_row.amount,
            'status', payment_row.status::text, 'verification_note', payment_row.verification_note), p_template_version);
        if queued_id is not null then created_count := created_count + 1; end if;
      end if;
    end if;
  end if;
  return created_count;
exception when others then
  return created_count;
end;
$$;

revoke all on function public.reconcile_payment_email_notification(uuid, timestamptz, text)
  from public, anon, authenticated;

-- The v1 triggers are replaced by fail-open versions. The helper functions
-- above remain callable by the reconciler for missed captures.
create or replace function public.queue_profile_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_profile_email_notification(new.id, case when tg_op = 'INSERT' then new.created_at else old.updated_at end, 'v1');
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.queue_payment_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_payment_email_notification(new.id, case when tg_op = 'INSERT' then new.created_at else old.updated_at end, 'v1');
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_profiles_email_notifications on public.profiles;
create trigger trg_profiles_email_notifications
  after insert or update of approval_status, approved_by, rejected_by on public.profiles
  for each row execute function public.queue_profile_email_notifications();

drop trigger if exists trg_payments_email_notifications on public.payments;
create trigger trg_payments_email_notifications
  after insert or update of status, verified_by, recorded_by on public.payments
  for each row execute function public.queue_payment_email_notifications();

revoke all on function public.queue_profile_email_notifications() from public, anon, authenticated;
revoke all on function public.queue_payment_email_notifications() from public, anon, authenticated;
revoke all on function public.stamp_profile_notification_transition() from public, anon, authenticated;
revoke all on function public.stamp_payment_notification_transition() from public, anon, authenticated;

grant execute on function public.enqueue_email_notification_v2(text, text, text, uuid, uuid, text, text, jsonb, text)
  to service_role;
grant execute on function public.claim_email_notification_batch(text, integer, integer)
  to service_role;
grant execute on function public.claim_stale_email_notification_batch(text, integer, integer)
  to service_role;
grant execute on function public.record_email_notification_outcome(uuid, uuid, text, text, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.replay_email_notification(uuid, uuid, text, boolean)
  to service_role;
grant execute on function public.mark_email_notification_run(text, text, boolean, jsonb, text)
  to service_role;
grant execute on function public.update_email_notification_incident(text, text, boolean, jsonb, integer)
  to service_role;
grant execute on function public.ack_email_notification_incident_delivery(text, boolean)
  to service_role;
grant execute on function public.cleanup_email_notification_outbox(timestamptz, timestamptz, integer)
  to service_role;
grant execute on function public.reconcile_profile_email_notification(uuid, timestamptz, text)
  to service_role;
grant execute on function public.reconcile_payment_email_notification(uuid, timestamptz, text)
  to service_role;
