-- =====================================================================
-- EVT-006: Tambahkan index yang belum ada, trigger updated_at untuk
-- expenses, dan validasi anti-transaksi pada event archived/cancelled.
-- Migration ini additive dan idempotent.
-- =====================================================================

begin;

-- Trigger updated_at untuk expenses (mirip dengan yang sudah ada di EVT-007)
create or replace function public.touch_expenses_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Hanya buat trigger jika expenses punya kolom updated_at
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'updated_at'
  ) then
    drop trigger if exists trg_expenses_updated on public.expenses;
    create trigger trg_expenses_updated
    before update on public.expenses
    for each row execute function public.touch_expenses_updated_at();
  end if;
end $$;

-- Index tambahan untuk non_ipl_incomes: recorded_by dan payment_method untuk reporting
create index if not exists idx_non_ipl_incomes_recorded_by
  on public.non_ipl_incomes(recorded_by)
  where deleted_at is null;

create index if not exists idx_non_ipl_incomes_payment_method
  on public.non_ipl_incomes(payment_method)
  where deleted_at is null;

-- Index tambahan untuk expenses: event_id standalone untuk join laporan
create index if not exists idx_expenses_event_id
  on public.expenses(event_id)
  where deleted_at is null and scope = 'event';

-- Backfill scope 'general' untuk expenses lama yang belum di-set
-- (seharusnya sudah dilakukan oleh EVT-005, tapi sebagai safeguard)
update public.expenses
set scope = 'general'
where (scope is null or btrim(scope) = '')
  and deleted_at is null;

-- Fungsi helper untuk mencegah transaksi baru pada event archived/cancelled
-- Dipakai oleh API layer (n8n) sebagai double-check sebelum insert
create or replace function public.event_accepts_new_transactions(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.deleted_at is null
      and e.status in ('active', 'completed')
  );
$$;

revoke all on function public.event_accepts_new_transactions(uuid) from public;
grant execute on function public.event_accepts_new_transactions(uuid) to authenticated;

-- Catatan: Constraint level database untuk blok transaksi event archived/cancelled
-- tidak ditambahkan karena melibatkan cross-table check yang lebih baik di API.
-- API n8n memvalidasi status event sebelum insert.

commit;
