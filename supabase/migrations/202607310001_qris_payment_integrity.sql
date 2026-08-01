-- Keep Midtrans QRIS payments and IPL bills consistent while preserving the
-- existing bank-transfer and cash payment behavior.

create or replace function public.normalize_qris_payment_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parsed_metadata jsonb;
begin
  if new.method <> 'qris' then
    return new;
  end if;

  if jsonb_typeof(new.metadata) = 'string' then
    begin
      parsed_metadata := (new.metadata #>> '{}')::jsonb;
    exception
      when invalid_text_representation then
        raise exception using
          errcode = '22023',
          message = 'PAYMENT_QRIS_METADATA_INVALID_JSON',
          detail = 'Metadata pembayaran QRIS harus berupa JSON object yang valid.';
    end;

    new.metadata := parsed_metadata;
  end if;

  if new.metadata is null or jsonb_typeof(new.metadata) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'PAYMENT_QRIS_METADATA_NOT_OBJECT',
      detail = 'Metadata pembayaran QRIS harus berupa JSON object.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_qris_payment_metadata on public.payments;
create trigger trg_normalize_qris_payment_metadata
  before insert or update of metadata, method
  on public.payments
  for each row execute function public.normalize_qris_payment_metadata();

-- Repair metadata written by the initial n8n QRIS workflow, which serialized
-- the object once too many before inserting it into the jsonb column.
update public.payments
   set metadata = (metadata #>> '{}')::jsonb
 where method = 'qris'
   and jsonb_typeof(metadata) = 'string';

alter table public.payments
  drop constraint if exists payments_qris_metadata_is_object;

alter table public.payments
  add constraint payments_qris_metadata_is_object
  check (
    method <> 'qris'
    or jsonb_typeof(metadata) = 'object'
  );

create or replace function public.validate_qris_payment_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_bill public.ipl_bills%rowtype;
  expected_amount numeric(12,2);
begin
  if new.method <> 'qris' then
    return new;
  end if;

  select *
    into target_bill
    from public.ipl_bills
   where id = new.ipl_bill_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_BILL_NOT_FOUND',
      detail = 'Tagihan untuk pembayaran QRIS tidak ditemukan.';
  end if;

  expected_amount := target_bill.amount + target_bill.late_fee;
  if new.amount is distinct from expected_amount then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_MISMATCH',
      detail = format('Nominal pembayaran QRIS harus %s.', expected_amount);
  end if;

  if new.status in ('pending', 'pending_verification', 'completed')
     and target_bill.status = 'cancelled' then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_BILL_CANCELLED',
      detail = 'Tagihan sudah dibatalkan.';
  end if;

  if new.status in ('pending', 'pending_verification', 'completed')
     and target_bill.status = 'paid'
     and (tg_op = 'INSERT' or target_bill.payment_id is distinct from new.id) then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_BILL_ALREADY_PAID',
      detail = 'Tagihan sudah lunas.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_qris_payment_write on public.payments;
create trigger trg_validate_qris_payment_write
  before insert or update of ipl_bill_id, amount, method, status
  on public.payments
  for each row execute function public.validate_qris_payment_write();

create or replace function public.sync_qris_payment_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Release the old bill if a QRIS payment is reassigned or its method changes.
  if tg_op = 'UPDATE'
     and old.method = 'qris'
     and (new.method <> 'qris' or old.ipl_bill_id is distinct from new.ipl_bill_id) then
    update public.ipl_bills
       set status = case when due_date < current_date then 'overdue'::public.bill_status
                         else 'pending'::public.bill_status end,
           payment_id = null
     where id = old.ipl_bill_id
       and payment_id = new.id;
  end if;

  if new.method <> 'qris' then
    return new;
  end if;

  if new.status in ('pending', 'pending_verification') then
    update public.ipl_bills
       set payment_id = new.id
     where id = new.ipl_bill_id;
  elsif new.status = 'completed' then
    update public.ipl_bills
       set status = 'paid',
           payment_id = new.id
     where id = new.ipl_bill_id;
  elsif new.status in ('rejected', 'failed', 'expired', 'cancelled', 'refunded')
        and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.ipl_bills
       set status = case when due_date < current_date then 'overdue'::public.bill_status
                         else 'pending'::public.bill_status end,
           payment_id = null
     where id = new.ipl_bill_id
       and payment_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_qris_payment_bill on public.payments;
create trigger trg_sync_qris_payment_bill
  after insert or update of status, ipl_bill_id, method
  on public.payments
  for each row execute function public.sync_qris_payment_bill();

-- Reconcile existing QRIS rows without guessing or changing provider status.
update public.ipl_bills b
   set status = 'paid',
       payment_id = p.id
  from public.payments p
 where p.method = 'qris'
   and p.status = 'completed'
   and b.id = p.ipl_bill_id
   and (b.status is distinct from 'paid' or b.payment_id is distinct from p.id);

update public.ipl_bills b
   set payment_id = p.id
  from public.payments p
 where p.method = 'qris'
   and p.status in ('pending', 'pending_verification')
   and b.id = p.ipl_bill_id
   and b.payment_id is distinct from p.id;

update public.ipl_bills b
   set status = case when b.due_date < current_date then 'overdue'::public.bill_status
                     else 'pending'::public.bill_status end,
       payment_id = null
  from public.payments p
 where p.method = 'qris'
   and p.status in ('rejected', 'failed', 'expired', 'cancelled', 'refunded')
   and b.id = p.ipl_bill_id
   and b.payment_id = p.id;

create index if not exists idx_payments_qris_parent_order_id
  on public.payments ((metadata ->> 'parent_order_id'))
  where method = 'qris';
