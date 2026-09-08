-- Allow zero nominal payment amount (amount >= 0) for manual payments recorded by admin/bendahara
-- while strictly preventing negative payment amounts (amount < 0).

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
  -- allow custom amount as long as amount >= 0.
  if new.status = 'pending_verification' and new.amount is distinct from expected_amount then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_MISMATCH',
      detail = format('Nominal pembayaran harus %s.', expected_amount);
  end if;

  if new.amount < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_AMOUNT_INVALID',
      detail = 'Nominal pembayaran tidak boleh bernilai negatif.';
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
