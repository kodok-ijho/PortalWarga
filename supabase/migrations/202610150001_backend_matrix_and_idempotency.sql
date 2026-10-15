-- Migration: Backend Hardening, Annual Matrix RPC, and Webhook Idempotency Layer
-- Timestamp: 202610150001
-- Author: Lin (Backend Engineer)

-- ============================================================================
-- 1. Idempotency Table for Webhook Events (n8n / Midtrans / Payment Gateways)
-- ============================================================================

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payment_id uuid references public.payments(id) on delete set null,
  order_id text,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'ignored', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_payment_webhook_events_provider_event unique (provider, event_id)
);

create index if not exists idx_payment_webhook_events_order_id
  on public.payment_webhook_events(order_id);

create index if not exists idx_payment_webhook_events_status
  on public.payment_webhook_events(status);

create index if not exists idx_payment_webhook_events_payment_id
  on public.payment_webhook_events(payment_id);

alter table public.payment_webhook_events enable row level security;

drop policy if exists "payment_webhook_events_staff_select" on public.payment_webhook_events;
create policy "payment_webhook_events_staff_select"
  on public.payment_webhook_events for select
  using (public.is_staff());

drop policy if exists "payment_webhook_events_service_all" on public.payment_webhook_events;
create policy "payment_webhook_events_service_all"
  on public.payment_webhook_events for all
  using (auth.role() = 'service_role');

drop trigger if exists trg_payment_webhook_events_updated on public.payment_webhook_events;
create trigger trg_payment_webhook_events_updated
  before update on public.payment_webhook_events
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 2. Concurrency Locking & Atomic Payment Verification Function
-- Eliminates race condition between manual cashier verification and gateway webhooks
-- ============================================================================

create or replace function public.verify_payment_transaction(
  p_payment_id uuid,
  p_action text,
  p_actor_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_payment public.payments%rowtype;
  target_bill public.ipl_bills%rowtype;
  resolved_actor uuid;
  action_norm text;
begin
  resolved_actor := coalesce(p_actor_id, public.current_profile_id());

  -- Access control: Only staff or service_role can verify transactions
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'PERMISSION_DENIED',
      detail = 'Hanya pengurus atau sistem yang berhak memverifikasi transaksi pembayaran.';
  end if;

  action_norm := lower(trim(p_action));

  -- 1. Pessimistic lock on the payment record
  select *
    into target_payment
    from public.payments
   where id = p_payment_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_NOT_FOUND',
      detail = format('Data pembayaran %s tidak ditemukan.', p_payment_id);
  end if;

  -- 2. Pessimistic lock on the associated IPL bill record
  select *
    into target_bill
    from public.ipl_bills
   where id = target_payment.ipl_bill_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_BILL_NOT_FOUND',
      detail = 'Tagihan IPL terkait pembayaran tidak ditemukan.';
  end if;

  -- Handle Approval
  if action_norm in ('approve', 'completed', 'verified') then
    -- Idempotency check: if already completed, return idempotent success
    if target_payment.status = 'completed' then
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'action', 'approve',
        'message', 'Pembayaran sudah berstatus disetujui sebelumnya.',
        'payment_id', target_payment.id,
        'status', target_payment.status,
        'ipl_bill_id', target_bill.id,
        'bill_status', target_bill.status
      );
    end if;

    -- Concurrency guard: verify bill isn't already paid by a different payment
    if target_bill.status = 'paid' and target_bill.payment_id is distinct from target_payment.id then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_BILL_ALREADY_PAID',
        detail = 'Tagihan IPL ini sudah berstatus lunas melalui transaksi pembayaran lain.';
    end if;

    if target_bill.status = 'cancelled' then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_BILL_CANCELLED',
        detail = 'Tagihan IPL terkait sudah dibatalkan.';
    end if;

    -- Atomically update payment
    update public.payments
       set status = 'completed',
           verified_by = resolved_actor,
           verified_at = coalesce(target_payment.verified_at, now()),
           paid_at = coalesce(target_payment.paid_at, now()),
           verification_note = coalesce(p_note, target_payment.verification_note),
           updated_at = now()
     where id = target_payment.id;

    -- Atomically update bill
    update public.ipl_bills
       set status = 'paid',
           payment_id = target_payment.id,
           updated_at = now()
     where id = target_bill.id;

    return jsonb_build_object(
      'success', true,
      'idempotent', false,
      'action', 'approve',
      'payment_id', target_payment.id,
      'status', 'completed',
      'ipl_bill_id', target_bill.id,
      'bill_status', 'paid',
      'verified_by', resolved_actor,
      'verified_at', now()
    );

  -- Handle Rejection
  elsif action_norm in ('reject', 'rejected') then
    if target_payment.status = 'rejected' then
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'action', 'reject',
        'message', 'Pembayaran sudah berstatus ditolak sebelumnya.',
        'payment_id', target_payment.id,
        'status', target_payment.status,
        'ipl_bill_id', target_bill.id,
        'bill_status', target_bill.status
      );
    end if;

    -- Atomically update payment
    update public.payments
       set status = 'rejected',
           verified_by = resolved_actor,
           verified_at = now(),
           verification_note = coalesce(p_note, target_payment.verification_note),
           updated_at = now()
     where id = target_payment.id;

    -- Atomically revert bill status if it was bound to this payment
    if target_bill.payment_id = target_payment.id then
      update public.ipl_bills
         set status = case when target_bill.due_date < current_date then 'overdue'::public.bill_status
                           else 'pending'::public.bill_status end,
             payment_id = null,
             updated_at = now()
       where id = target_bill.id;
    end if;

    return jsonb_build_object(
      'success', true,
      'idempotent', false,
      'action', 'reject',
      'payment_id', target_payment.id,
      'status', 'rejected',
      'ipl_bill_id', target_bill.id,
      'bill_status', case when target_bill.due_date < current_date then 'overdue' else 'pending' end,
      'verified_by', resolved_actor,
      'verified_at', now()
    );

  else
    raise exception using
      errcode = '22023',
      message = 'INVALID_ACTION',
      detail = format('Aksi verifikasi tidak valid: "%s". Gunakan "approve" atau "reject".', p_action);
  end if;
end;
$$;

-- Idempotent Webhook Processing RPC with Pessimistic Lock
create or replace function public.process_payment_webhook_with_lock(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_order_id text,
  p_target_status text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_event public.payment_webhook_events%rowtype;
  v_event_record_id uuid;
  target_payment public.payments%rowtype;
  target_bill public.ipl_bills%rowtype;
  resolved_payment_status public.payment_status;
begin
  if auth.role() <> 'service_role' and not public.is_staff() then
    raise exception using
      errcode = '42501',
      message = 'PERMISSION_DENIED',
      detail = 'Hanya service_role atau staff yang dapat memproses webhook event.';
  end if;

  -- 1. Idempotency check with lock on event table
  select *
    into v_existing_event
    from public.payment_webhook_events
   where provider = p_provider
     and event_id = p_event_id
   for update;

  if found then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Webhook event sudah pernah diterima/diproses.',
      'event_record_id', v_existing_event.id,
      'status', v_existing_event.status
    );
  end if;

  -- Insert event log as processing
  insert into public.payment_webhook_events (
    provider,
    event_id,
    event_type,
    order_id,
    status,
    payload
  ) values (
    p_provider,
    p_event_id,
    p_event_type,
    p_order_id,
    'processing',
    p_payload
  ) returning id into v_event_record_id;

  -- 2. Find and lock the target payment by order_id
  select *
    into target_payment
    from public.payments
   where order_id = p_order_id
   for update;

  if not found then
    update public.payment_webhook_events
       set status = 'ignored',
           error_message = format('Pembayaran dengan order_id %s tidak ditemukan.', p_order_id),
           updated_at = now()
     where id = v_event_record_id;

    return jsonb_build_object(
      'success', false,
      'idempotent', false,
      'event_record_id', v_event_record_id,
      'status', 'ignored',
      'detail', 'Order ID tidak ditemukan di tabel payments.'
    );
  end if;

  -- 3. Lock associated ipl_bill
  select *
    into target_bill
    from public.ipl_bills
   where id = target_payment.ipl_bill_id
   for update;

  update public.payment_webhook_events
     set payment_id = target_payment.id
   where id = v_event_record_id;

  -- Map gateway status to payment_status
  if lower(trim(p_target_status)) in ('settlement', 'capture', 'success', 'completed') then
    resolved_payment_status := 'completed'::public.payment_status;
  elsif lower(trim(p_target_status)) in ('deny', 'cancel', 'cancelled') then
    resolved_payment_status := 'cancelled'::public.payment_status;
  elsif lower(trim(p_target_status)) in ('expire', 'expired') then
    resolved_payment_status := 'expired'::public.payment_status;
  elsif lower(trim(p_target_status)) in ('pending') then
    resolved_payment_status := 'pending'::public.payment_status;
  else
    resolved_payment_status := 'failed'::public.payment_status;
  end if;

  if target_payment.status = 'completed' and resolved_payment_status = 'completed' then
    update public.payment_webhook_events
       set status = 'processed',
           processed_at = now(),
           updated_at = now()
     where id = v_event_record_id;

    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'event_record_id', v_event_record_id,
      'payment_id', target_payment.id,
      'status', 'processed'
    );
  end if;

  -- Atomically update payment
  update public.payments
     set status = resolved_payment_status,
         paid_at = case when resolved_payment_status = 'completed' then coalesce(paid_at, now()) else paid_at end,
         metadata = metadata || jsonb_build_object('webhook_provider', p_provider, 'webhook_event_id', p_event_id),
         updated_at = now()
   where id = target_payment.id;

  -- Atomically update bill
  if resolved_payment_status = 'completed' then
    update public.ipl_bills
       set status = 'paid',
           payment_id = target_payment.id,
           updated_at = now()
     where id = target_bill.id;
  elsif resolved_payment_status in ('cancelled', 'expired', 'failed') and target_bill.payment_id = target_payment.id then
    update public.ipl_bills
       set status = case when target_bill.due_date < current_date then 'overdue'::public.bill_status
                         else 'pending'::public.bill_status end,
           payment_id = null,
           updated_at = now()
     where id = target_bill.id;
  end if;

  update public.payment_webhook_events
     set status = 'processed',
         processed_at = now(),
         updated_at = now()
   where id = v_event_record_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'event_record_id', v_event_record_id,
    'payment_id', target_payment.id,
    'payment_status', resolved_payment_status,
    'status', 'processed'
  );
end;
$$;

-- ============================================================================
-- 3. PostgreSQL RPC `get_annual_matrix_summary(p_year int)`
-- Server-side aggregation for unit payment matrix across fiscal year
-- (July YYYY to June YYYY+1) replacing heavy client-side computation
-- ============================================================================

create or replace function public.get_annual_matrix_summary(
  p_year int,
  p_unit_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_periods text[];
  v_user_profile_id uuid;
  v_user_unit_id bigint;
  v_is_staff boolean;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_YEAR',
      detail = 'Tahun matriks harus antara 2000 dan 2100.';
  end if;

  -- Fiscal year periods: July (p_year) through June (p_year + 1)
  v_periods := array[
    p_year::text || '-07',
    p_year::text || '-08',
    p_year::text || '-09',
    p_year::text || '-10',
    p_year::text || '-11',
    p_year::text || '-12',
    (p_year + 1)::text || '-01',
    (p_year + 1)::text || '-02',
    (p_year + 1)::text || '-03',
    (p_year + 1)::text || '-04',
    (p_year + 1)::text || '-05',
    (p_year + 1)::text || '-06'
  ];

  v_user_profile_id := public.current_profile_id();
  v_is_staff := public.is_staff();

  if not v_is_staff and v_user_profile_id is not null then
    select unit_id into v_user_unit_id
      from public.profiles
     where id = v_user_profile_id;
  end if;

  with target_units as (
    select
      u.id as unit_id,
      u.block,
      u.unit_number,
      u.floor,
      u.size,
      u.occupancy_status,
      u.is_occupied,
      u.notes
    from public.units u
    where (p_unit_id is null or u.id = p_unit_id)
    order by u.block, u.unit_number
  ),
  unit_residents as (
    select distinct on (pr.unit_id)
      pr.unit_id,
      pr.id as resident_id,
      pr.full_name,
      pr.email,
      pr.phone,
      pr.approval_status as resident_status
    from public.profiles pr
    where pr.unit_id is not null
      and pr.is_active = true
      and pr.approval_status = 'approved'
    order by pr.unit_id, pr.created_at asc
  ),
  unit_periods as (
    select
      tu.unit_id,
      p.period,
      p.period_idx
    from target_units tu
    cross join unnest(v_periods) with ordinality as p(period, period_idx)
  ),
  period_bills as (
    select
      up.unit_id,
      up.period,
      up.period_idx,
      b.id as bill_id,
      b.amount,
      b.late_fee,
      b.due_date,
      b.status as bill_status,
      b.payment_id as bill_payment_id,
      b.notes as bill_notes
    from unit_periods up
    left join public.ipl_bills b
      on b.unit_id = up.unit_id
     and b.period = up.period
  ),
  period_payments as (
    select distinct on (pb.unit_id, pb.period)
      pb.unit_id,
      pb.period,
      pm.id as payment_id,
      pm.amount as payment_amount,
      pm.method as payment_method,
      pm.status as payment_status,
      pm.paid_at,
      pm.order_id,
      pm.transaction_id,
      pm.proof_file_path,
      pm.proof_file_id,
      pm.verified_at,
      pm.verification_note,
      pm.metadata
    from period_bills pb
    left join public.payments pm
      on (
        (pb.bill_payment_id is not null and pm.id = pb.bill_payment_id)
        or (pb.bill_payment_id is null and pb.bill_id is not null and pm.ipl_bill_id = pb.bill_id)
      )
    order by pb.unit_id, pb.period, pm.created_at desc nulls last
  ),
  unit_cells as (
    select
      pb.unit_id,
      pb.period_idx,
      jsonb_build_object(
        'period', pb.period,
        'status', coalesce(pb.bill_status::text, 'unbilled'),
        'bill', case
          when pb.bill_id is null then null
          else jsonb_build_object(
            'id', pb.bill_id,
            'unit_id', pb.unit_id,
            'period', pb.period,
            'amount', pb.amount,
            'late_fee', pb.late_fee,
            'due_date', pb.due_date,
            'status', pb.bill_status,
            'payment_id', pb.bill_payment_id,
            'notes', pb.bill_notes
          )
        end,
        'payment', case
          when pay.payment_id is null then null
          when v_is_staff or (v_user_unit_id is not null and v_user_unit_id = pb.unit_id) then
            jsonb_build_object(
              'id', pay.payment_id,
              'ipl_bill_id', pb.bill_id,
              'amount', pay.payment_amount,
              'method', pay.payment_method,
              'status', pay.payment_status,
              'paid_at', pay.paid_at,
              'order_id', pay.order_id,
              'transaction_id', pay.transaction_id,
              'proof_file_path', pay.proof_file_path,
              'proof_file_id', pay.proof_file_id,
              'verified_at', pay.verified_at,
              'verification_note', pay.verification_note,
              'metadata', pay.metadata
            )
          else
            jsonb_build_object(
              'id', pay.payment_id,
              'ipl_bill_id', pb.bill_id,
              'method', pay.payment_method,
              'status', pay.payment_status
            )
        end
      ) as cell_data,
      pb.amount as cell_amount,
      pb.late_fee as cell_late_fee,
      pb.bill_status as cell_bill_status
    from period_bills pb
    left join period_payments pay
      on pay.unit_id = pb.unit_id
     and pay.period = pb.period
  ),
  aggregated_units as (
    select
      tu.unit_id,
      jsonb_build_object(
        'id', tu.unit_id,
        'block', tu.block,
        'unit_number', tu.unit_number,
        'floor', tu.floor,
        'size', tu.size,
        'occupancy_status', tu.occupancy_status,
        'is_occupied', tu.is_occupied,
        'notes', tu.notes
      ) as unit_obj,
      case
        when ur.resident_id is null then null
        else jsonb_build_object(
          'id', ur.resident_id,
          'full_name', ur.full_name,
          'email', case when v_is_staff or tu.unit_id = v_user_unit_id then ur.email else null end,
          'phone', case when v_is_staff or tu.unit_id = v_user_unit_id then ur.phone else null end,
          'occupancy_status', ur.resident_status
        )
      end as resident_obj,
      jsonb_agg(uc.cell_data order by uc.period_idx) as cells_arr,
      jsonb_build_object(
        'total_billed', coalesce(sum(uc.cell_amount + uc.cell_late_fee), 0),
        'total_paid', coalesce(sum(case when uc.cell_bill_status = 'paid' then uc.cell_amount + uc.cell_late_fee else 0 end), 0),
        'total_pending', coalesce(sum(case when uc.cell_bill_status = 'pending' then uc.cell_amount + uc.cell_late_fee else 0 end), 0),
        'total_overdue', coalesce(sum(case when uc.cell_bill_status = 'overdue' then uc.cell_amount + uc.cell_late_fee else 0 end), 0),
        'paid_count', count(*) filter (where uc.cell_bill_status = 'paid'),
        'pending_count', count(*) filter (where uc.cell_bill_status = 'pending'),
        'overdue_count', count(*) filter (where uc.cell_bill_status = 'overdue'),
        'unbilled_count', count(*) filter (where uc.cell_bill_status is null)
      ) as summary_obj
    from target_units tu
    left join unit_residents ur on ur.unit_id = tu.unit_id
    left join unit_cells uc on uc.unit_id = tu.unit_id
    group by
      tu.unit_id, tu.block, tu.unit_number, tu.floor, tu.size,
      tu.occupancy_status, tu.is_occupied, tu.notes,
      ur.resident_id, ur.full_name, ur.email, ur.phone, ur.resident_status
    order by tu.block, tu.unit_number
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'unit', au.unit_obj,
        'resident', au.resident_obj,
        'cells', au.cells_arr,
        'summary', au.summary_obj
      )
    ),
    '[]'::jsonb
  )
  into result
  from aggregated_units au;

  return result;
end;
$$;

-- Grant execution permissions
grant execute on function public.get_annual_matrix_summary(int, bigint) to authenticated, anon, service_role;
grant execute on function public.verify_payment_transaction(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.process_payment_webhook_with_lock(text, text, text, text, text, jsonb) to service_role, authenticated;
