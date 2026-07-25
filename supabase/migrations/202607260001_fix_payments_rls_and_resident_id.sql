-- Migration: Fix payments RLS policy and backfill resident_id
-- Date: 2026-07-26

-- 1. Backfill resident_id in payments from ipl_bills if missing
update public.payments p
set resident_id = b.resident_id
from public.ipl_bills b
where p.ipl_bill_id = b.id
  and p.resident_id is null
  and b.resident_id is not null;

-- 2. Backfill resident_id from profiles (unit_id match) if still missing
update public.payments p
set resident_id = pr.id
from public.ipl_bills b
join public.profiles pr on pr.unit_id = b.unit_id
where p.ipl_bill_id = b.id
  and p.resident_id is null;

-- 3. Enhance payments RLS select policy to allow resident reads via unit_id match
drop policy if exists "payments_select_own_or_staff" on public.payments;

create policy "payments_select_own_or_staff"
  on public.payments for select
  using (
    public.is_staff()
    or resident_id = public.current_profile_id()
    or exists (
      select 1 from public.ipl_bills b
      join public.profiles p on p.unit_id = b.unit_id
      where b.id = payments.ipl_bill_id
        and p.id = public.current_profile_id()
    )
    or exists (
      select 1 from public.ipl_bills b
      where b.id = payments.ipl_bill_id
        and b.resident_id = public.current_profile_id()
    )
  );
