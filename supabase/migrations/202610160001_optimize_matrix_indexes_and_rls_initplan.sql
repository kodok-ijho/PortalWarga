-- Migration: Optimize Payment Matrix Indexes & RLS InitPlan
-- Migration ID: 202610160001_optimize_matrix_indexes_and_rls_initplan.sql
-- Description:
--   1. Adds composite indexes for faster payment and billing lookups in matrix queries:
--      - idx_payments_ipl_bill_status on public.payments(ipl_bill_id, status)
--      - idx_ipl_bills_period_status on public.ipl_bills(period, status)
--      - idx_ipl_bills_unit_period on public.ipl_bills(unit_id, period)
--   2. Optimizes Row-Level Security (RLS) policies on public.ipl_bills, public.payments,
--      and public.profiles by wrapping security helper functions (public.is_staff(),
--      public.current_profile_id()) in scalar subqueries (select ...).
--      This forces PostgreSQL to evaluate them once as InitPlans per query rather
--      than re-evaluating them for every scanned row, drastically reducing execution time.
--   3. Re-affirms execute grants on public.get_annual_matrix_summary for authenticated,
--      anon, and service_role.

-- ============================================================================
-- 1. Composite Indexes
-- ============================================================================

-- Fast lookup for payments by bill and status (used in cell payment resolution)
create index if not exists idx_payments_ipl_bill_status
  on public.payments(ipl_bill_id, status);

-- Fast lookup for bills by period and status (used in annual aggregation)
create index if not exists idx_ipl_bills_period_status
  on public.ipl_bills(period, status);

-- Fast lookup for unit bills across specific periods
create index if not exists idx_ipl_bills_unit_period
  on public.ipl_bills(unit_id, period);

-- ============================================================================
-- 2. Optimize RLS Policies with InitPlan Scalar Subqueries
-- ============================================================================

-- 2a. Optimize ipl_bills RLS select policy
drop policy if exists "bills_select_own_or_staff" on public.ipl_bills;

create policy "bills_select_own_or_staff"
  on public.ipl_bills for select
  using (
    (select public.is_staff())
    or resident_id = (select public.current_profile_id())
    or exists (
      select 1 from public.profiles p
      where p.unit_id = ipl_bills.unit_id
        and p.id = (select public.current_profile_id())
    )
  );

-- 2b. Optimize payments RLS select policy
drop policy if exists "payments_select_own_or_staff" on public.payments;

create policy "payments_select_own_or_staff"
  on public.payments for select
  using (
    (select public.is_staff())
    or resident_id = (select public.current_profile_id())
    or exists (
      select 1 from public.ipl_bills b
      join public.profiles p on p.unit_id = b.unit_id
      where b.id = payments.ipl_bill_id
        and p.id = (select public.current_profile_id())
    )
    or exists (
      select 1 from public.ipl_bills b
      where b.id = payments.ipl_bill_id
        and b.resident_id = (select public.current_profile_id())
    )
  );

-- 2c. Optimize profiles RLS select policy
drop policy if exists "profiles_select_self_or_staff" on public.profiles;

create policy "profiles_select_self_or_staff"
  on public.profiles for select
  using (
    (select public.is_staff())
    or id = (select public.current_profile_id())
  );

-- ============================================================================
-- 3. Execution Permissions
-- ============================================================================

grant execute on function public.get_annual_matrix_summary(int, bigint) to authenticated, anon, service_role;
