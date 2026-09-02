-- Allow custom payment amount for direct/completed manual payments recorded by admin/bendahara
-- and ensure ipl_bills amount stays synced with the recorded payment amount.

create or replace function public.validate_manual_payment_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_bill public.ipl_bills%rowtype;
  expected_amount numeric(12,2);
begin
  if new.method not in ('bank_transfer', 'cash') then
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
      detail = 'Tagihan untuk pembayaran tidak ditemukan.';
  end if;

  expected_amount := target_bill.amount + target_bill.late_fee;
  -- If payment is submitted for verification (pending_verification by warga/pengurus),
  -- enforce exact bill amount match. For completed payments (recorded directly by admin/bendahara),
  -- allow custom amount as long as amount > 0.
  if new.status = 'pending_verification' and new.amount is distinct from expected_amount then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_MISMATCH',
      detail = format('Nominal pembayaran harus %s.', expected_amount);
  end if;

  if new.amount <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_INVALID',
      detail = 'Nominal pembayaran harus lebih besar dari 0.';
  end if;

  if new.status in ('pending_verification', 'completed')
     and target_bill.status = 'cancelled' then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_BILL_CANCELLED',
      detail = 'Tagihan sudah dibatalkan.';
  end if;

  if tg_op = 'INSERT'
     and new.status in ('pending_verification', 'completed')
     and target_bill.status = 'paid' then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_BILL_ALREADY_PAID',
      detail = 'Tagihan sudah lunas.';
  end if;

  return new;
end;
$$;

create or replace function public.sync_manual_payment_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.method not in ('bank_transfer', 'cash') then
    return new;
  end if;

  if new.status = 'pending_verification' then
    update public.ipl_bills
       set payment_id = new.id
     where id = new.ipl_bill_id;
  elsif new.status = 'completed' then
    update public.ipl_bills
       set status = 'paid',
           payment_id = new.id,
           amount = new.amount,
           late_fee = 0
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
