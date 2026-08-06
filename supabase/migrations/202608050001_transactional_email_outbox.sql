-- =====================================================================
-- Portal Warga Palm Village - Transactional email notification outbox
-- ---------------------------------------------------------------------
-- Database triggers create durable, deduplicated email jobs. n8n owns the
-- actual delivery through Gmail, so API responses and browser connectivity
-- do not determine whether a notification is eventually sent.
-- =====================================================================

create table if not exists public.email_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_notification_outbox_status_check
    check (status in ('pending', 'processing', 'sent', 'failed')),
  constraint email_notification_outbox_email_check
    check (position('@' in recipient_email) > 1)
);

create index if not exists idx_email_notification_outbox_pending
  on public.email_notification_outbox(status, available_at, created_at);

alter table public.email_notification_outbox enable row level security;

drop trigger if exists trg_email_notification_outbox_updated on public.email_notification_outbox;
create trigger trg_email_notification_outbox_updated
  before update on public.email_notification_outbox
  for each row execute function public.touch_updated_at();

revoke all on public.email_notification_outbox from anon, authenticated;
grant select, update on public.email_notification_outbox to service_role;

create or replace function public.enqueue_email_notification(
  p_dedupe_key text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_recipient_id uuid,
  p_recipient_email text,
  p_recipient_name text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_recipient_email), '') = ''
     or position('@' in p_recipient_email) <= 1 then
    return;
  end if;

  insert into public.email_notification_outbox (
    dedupe_key, event_type, entity_type, entity_id, recipient_id,
    recipient_email, recipient_name, payload
  ) values (
    p_dedupe_key, p_event_type, p_entity_type, p_entity_id, p_recipient_id,
    lower(trim(p_recipient_email)), nullif(trim(p_recipient_name), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (dedupe_key) do nothing;
exception when others then
  -- Email capture is fail-open. A later reconciler repairs missing jobs; the
  -- business transaction must never be rolled back by notification failure.
  return;
end;
$$;

revoke all on function public.enqueue_email_notification(text, text, text, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.queue_profile_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
  actor_id uuid;
  actor_email text;
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_email_notification(
      'profile.registered.user:' || new.id::text || ':' || lower(new.email),
      'profile.registered.user', 'profile', new.id, new.id, new.email,
      new.full_name,
      jsonb_build_object('full_name', new.full_name, 'email', new.email,
        'role', new.role::text, 'approval_status', new.approval_status::text,
        'created_at', new.created_at)
    );

    for admin_row in
      select id, email, full_name
      from public.profiles
      where role = 'admin'::public.user_role
        and approval_status = 'approved'::public.approval_status
        and is_active = true
        and id <> new.id
    loop
      perform public.enqueue_email_notification(
        'profile.registered.admin:' || new.id::text || ':' || lower(admin_row.email),
        'profile.registered.admin', 'profile', new.id, admin_row.id,
        admin_row.email, admin_row.full_name,
        jsonb_build_object('full_name', new.full_name, 'email', new.email,
          'role', new.role::text, 'approval_status', new.approval_status::text,
          'created_at', new.created_at)
      );
    end loop;

    return new;
  end if;

  if new.approval_status is distinct from old.approval_status then
    actor_id := case
      when new.approval_status = 'approved'::public.approval_status then new.approved_by
      when new.approval_status = 'rejected'::public.approval_status then new.rejected_by
      else null
    end;

    actor_email := null;
    if actor_id is not null then
      select email into actor_email from public.profiles where id = actor_id;
    end if;

    perform public.enqueue_email_notification(
      'profile.verification.user:' || new.id::text || ':' || new.approval_status::text,
      'profile.verification.user', 'profile', new.id, new.id, new.email,
      new.full_name,
      jsonb_build_object('full_name', new.full_name, 'email', new.email,
        'role', new.role::text, 'approval_status', new.approval_status::text,
        'approval_note', new.approval_note, 'approved_at', new.approved_at,
        'rejected_at', new.rejected_at)
    );

    for admin_row in
      select id, email, full_name
      from public.profiles
      where role = 'admin'::public.user_role
        and approval_status = 'approved'::public.approval_status
        and is_active = true
        and id <> coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and id <> new.id
    loop
      perform public.enqueue_email_notification(
        'profile.verification.admin:' || new.id::text || ':' || new.approval_status::text || ':' || lower(admin_row.email),
        'profile.verification.admin', 'profile', new.id, admin_row.id,
        admin_row.email, admin_row.full_name,
        jsonb_build_object('full_name', new.full_name, 'email', new.email,
          'approval_status', new.approval_status::text, 'approval_note', new.approval_note)
      );
    end loop;

    if actor_id is not null and actor_email is distinct from new.email then
      perform public.enqueue_email_notification(
        'profile.verification.actor:' || new.id::text || ':' || new.approval_status::text || ':' || actor_id::text,
        'profile.verification.actor', 'profile', new.id, actor_id,
        actor_email, null,
        jsonb_build_object('full_name', new.full_name, 'email', new.email,
          'approval_status', new.approval_status::text, 'approval_note', new.approval_note)
      );
    end if;
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_profiles_email_notifications on public.profiles;
create trigger trg_profiles_email_notifications
  after insert or update of approval_status on public.profiles
  for each row execute function public.queue_profile_email_notifications();

create or replace function public.queue_payment_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bill_row record;
  resident_row record;
  staff_row record;
  verifier_email text;
  verifier_name text;
begin
  select b.period, b.unit_id, u.block, u.unit_number
    into bill_row
    from public.ipl_bills b
    left join public.units u on u.id = b.unit_id
   where b.id = new.ipl_bill_id;

  select id, email, full_name
    into resident_row
    from public.profiles
   where id = coalesce(new.resident_id, (select resident_id from public.ipl_bills where id = new.ipl_bill_id));

  if tg_op = 'INSERT' then
    if resident_row.email is not null then
      perform public.enqueue_email_notification(
        'payment.recorded.resident:' || new.id::text || ':' || lower(resident_row.email),
        'payment.recorded.resident', 'payment', new.id, resident_row.id,
        resident_row.email, resident_row.full_name,
        jsonb_build_object('payment_id', new.id, 'period', bill_row.period,
          'unit_label', concat_ws('/', bill_row.block, bill_row.unit_number),
          'amount', new.amount, 'method', new.method::text,
          'status', new.status::text, 'paid_at', new.paid_at,
          'created_at', new.created_at)
      );
    end if;

    for staff_row in
      select p.id, p.email, p.full_name
      from public.profiles p
      where p.role in ('admin'::public.user_role, 'bendahara'::public.user_role)
        and p.approval_status = 'approved'::public.approval_status
        and p.is_active = true
        and (resident_row.email is null or p.email <> resident_row.email)
    loop
      perform public.enqueue_email_notification(
        'payment.recorded.staff:' || new.id::text || ':' || lower(staff_row.email),
        'payment.recorded.staff', 'payment', new.id, staff_row.id,
        staff_row.email, staff_row.full_name,
        jsonb_build_object('payment_id', new.id, 'resident_name', resident_row.full_name,
          'resident_email', resident_row.email, 'period', bill_row.period,
          'unit_label', concat_ws('/', bill_row.block, bill_row.unit_number),
          'amount', new.amount, 'method', new.method::text,
          'status', new.status::text, 'paid_at', new.paid_at,
          'created_at', new.created_at)
      );
    end loop;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status in ('completed'::public.payment_status, 'rejected'::public.payment_status) then
    if resident_row.email is not null then
      perform public.enqueue_email_notification(
        'payment.verification.resident:' || new.id::text || ':' || new.status::text || ':' || lower(resident_row.email),
        'payment.verification.resident', 'payment', new.id, resident_row.id,
        resident_row.email, resident_row.full_name,
        jsonb_build_object('payment_id', new.id, 'period', bill_row.period,
          'unit_label', concat_ws('/', bill_row.block, bill_row.unit_number),
          'amount', new.amount, 'method', new.method::text,
          'status', new.status::text, 'verification_note', new.verification_note,
          'verified_at', new.verified_at)
      );
    end if;

    for staff_row in
      select p.id, p.email, p.full_name
      from public.profiles p
      where p.role in ('admin'::public.user_role, 'bendahara'::public.user_role)
        and p.approval_status = 'approved'::public.approval_status
        and p.is_active = true
        and (resident_row.email is null or p.email <> resident_row.email)
        and (new.verified_by is null or p.id <> new.verified_by)
    loop
      perform public.enqueue_email_notification(
        'payment.verification.staff:' || new.id::text || ':' || new.status::text || ':' || lower(staff_row.email),
        'payment.verification.staff', 'payment', new.id, staff_row.id,
        staff_row.email, staff_row.full_name,
        jsonb_build_object('payment_id', new.id, 'resident_name', resident_row.full_name,
          'period', bill_row.period, 'amount', new.amount, 'status', new.status::text,
          'verification_note', new.verification_note)
      );
    end loop;

    if new.verified_by is not null then
      select email, full_name into verifier_email, verifier_name
        from public.profiles where id = new.verified_by;
      if verifier_email is not null and verifier_email is distinct from resident_row.email then
        perform public.enqueue_email_notification(
          'payment.verification.actor:' || new.id::text || ':' || new.status::text || ':' || new.verified_by::text,
          'payment.verification.actor', 'payment', new.id, new.verified_by,
          verifier_email, verifier_name,
          jsonb_build_object('payment_id', new.id, 'resident_name', resident_row.full_name,
            'period', bill_row.period, 'amount', new.amount, 'status', new.status::text,
            'verification_note', new.verification_note)
        );
      end if;
    end if;
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_payments_email_notifications on public.payments;
create trigger trg_payments_email_notifications
  after insert or update of status on public.payments
  for each row execute function public.queue_payment_email_notifications();

revoke all on function public.queue_profile_email_notifications() from public, anon, authenticated;
revoke all on function public.queue_payment_email_notifications() from public, anon, authenticated;
