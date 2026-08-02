-- =====================================================================
-- Event finance foundation (additive and idempotent)
-- ---------------------------------------------------------------------
-- This migration deliberately does not alter the global user_role enum,
-- payments, IPL bills, RSVP flow, or any Midtrans/QRIS data path.
-- Existing events and expenses remain valid; legacy expenses are scoped to
-- `general` and existing event_date remains the event start date.
-- =====================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type public.event_status as enum (
      'draft', 'active', 'completed', 'cancelled', 'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'event_assignment_role') then
    create type public.event_assignment_role as enum (
      'coordinator_member', 'event_treasurer'
    );
  end if;
end $$;

alter table public.events
  add column if not exists event_code text,
  add column if not exists end_date timestamptz,
  add column if not exists status public.event_status not null default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- Existing public events remain selectable and receive a deterministic code.
update public.events
set event_code = 'EVT-' || upper(replace(id::text, '-', ''))
where event_code is null or btrim(event_code) = '';

alter table public.events
  alter column event_code set not null;

create unique index if not exists idx_events_event_code_active
  on public.events(event_code)
  where deleted_at is null and event_code is not null;

create index if not exists idx_events_status_active
  on public.events(status, event_date)
  where deleted_at is null;

create table if not exists public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  assignment_role public.event_assignment_role not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_event_members_active_profile
  on public.event_members(event_id, profile_id)
  where revoked_at is null;

create index if not exists idx_event_members_active_event
  on public.event_members(event_id, assignment_role)
  where revoked_at is null;

create index if not exists idx_event_members_active_profile_lookup
  on public.event_members(profile_id, assignment_role)
  where revoked_at is null;

create table if not exists public.non_ipl_incomes (
  id uuid primary key default gen_random_uuid(),
  income_date date not null,
  scope text not null default 'general',
  event_id uuid references public.events(id) on delete restrict,
  category text not null,
  source_name text not null,
  amount numeric(12,2) not null,
  payment_method public.payment_method not null default 'other',
  reference_number text,
  description text not null,
  receipt_file_provider text not null default 'google_drive',
  receipt_file_id text,
  receipt_file_url text,
  receipt_file_name text,
  receipt_file_mime_type text,
  receipt_file_size bigint,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

alter table public.expenses
  add column if not exists scope text not null default 'general',
  add column if not exists event_id uuid references public.events(id) on delete restrict,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'non_ipl_incomes_scope_event_check'
      and conrelid = 'public.non_ipl_incomes'::regclass
  ) then
    alter table public.non_ipl_incomes
      add constraint non_ipl_incomes_scope_event_check
      check (
        (scope = 'event' and event_id is not null)
        or (scope = 'general' and event_id is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'non_ipl_incomes_scope_value_check'
      and conrelid = 'public.non_ipl_incomes'::regclass
  ) then
    alter table public.non_ipl_incomes
      add constraint non_ipl_incomes_scope_value_check
      check (scope in ('general', 'event'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'non_ipl_incomes_amount_positive'
      and conrelid = 'public.non_ipl_incomes'::regclass
  ) then
    alter table public.non_ipl_incomes
      add constraint non_ipl_incomes_amount_positive check (amount > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'non_ipl_incomes_source_not_blank'
      and conrelid = 'public.non_ipl_incomes'::regclass
  ) then
    alter table public.non_ipl_incomes
      add constraint non_ipl_incomes_source_not_blank check (length(btrim(source_name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'non_ipl_incomes_category_not_blank'
      and conrelid = 'public.non_ipl_incomes'::regclass
  ) then
    alter table public.non_ipl_incomes
      add constraint non_ipl_incomes_category_not_blank check (length(btrim(category)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'non_ipl_incomes_description_not_blank'
      and conrelid = 'public.non_ipl_incomes'::regclass
  ) then
    alter table public.non_ipl_incomes
      add constraint non_ipl_incomes_description_not_blank check (length(btrim(description)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_scope_event_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_scope_event_check
      check (
        (scope = 'event' and event_id is not null)
        or (scope = 'general' and event_id is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_scope_value_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_scope_value_check check (scope in ('general', 'event'));
  end if;
end $$;

create index if not exists idx_non_ipl_incomes_scope_event_date
  on public.non_ipl_incomes(scope, event_id, income_date, deleted_at);

create index if not exists idx_non_ipl_incomes_category
  on public.non_ipl_incomes(category)
  where deleted_at is null;

create index if not exists idx_expenses_scope_event_date
  on public.expenses(scope, event_id, expense_date, deleted_at);

create index if not exists idx_expenses_deleted_at
  on public.expenses(deleted_at);

create or replace function public.touch_event_finance_updated_at()
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

drop trigger if exists trg_event_members_updated on public.event_members;
create trigger trg_event_members_updated
before update on public.event_members
for each row execute function public.touch_event_finance_updated_at();

drop trigger if exists trg_non_ipl_incomes_updated on public.non_ipl_incomes;
create trigger trg_non_ipl_incomes_updated
before update on public.non_ipl_incomes
for each row execute function public.touch_event_finance_updated_at();

create or replace function public.can_view_event_finance(p_event_id uuid)
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
      and (
        public.current_role() in ('admin', 'bendahara')
        or exists (
          select 1
          from public.event_members em
          where em.event_id = e.id
            and em.profile_id = public.current_profile_id()
            and em.revoked_at is null
        )
      )
  );
$$;

create or replace function public.can_manage_event_finance(p_event_id uuid)
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
      and (
        public.current_role() in ('admin', 'bendahara')
        or exists (
          select 1
          from public.event_members em
          where em.event_id = e.id
            and em.profile_id = public.current_profile_id()
            and em.assignment_role = 'event_treasurer'
            and em.revoked_at is null
            and e.status in ('active', 'completed')
            and e.deleted_at is null
        )
      )
  );
$$;

create or replace function public.can_create_event_finance(p_event_id uuid)
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
      and (
        public.current_role() in ('admin', 'bendahara')
        or exists (
          select 1
          from public.event_members em
          where em.event_id = e.id
            and em.profile_id = public.current_profile_id()
            and em.assignment_role = 'event_treasurer'
            and em.revoked_at is null
        )
      )
  );
$$;

revoke all on function public.can_view_event_finance(uuid) from public;
revoke all on function public.can_manage_event_finance(uuid) from public;
revoke all on function public.can_create_event_finance(uuid) from public;
grant execute on function public.can_view_event_finance(uuid) to authenticated;
grant execute on function public.can_manage_event_finance(uuid) to authenticated;
grant execute on function public.can_create_event_finance(uuid) to authenticated;

alter table public.event_members enable row level security;
alter table public.non_ipl_incomes enable row level security;

drop policy if exists event_members_select_scoped on public.event_members;
create policy event_members_select_scoped
on public.event_members for select
using (
  public.current_role() in ('admin', 'bendahara')
  or profile_id = public.current_profile_id()
);

drop policy if exists event_members_insert_admin on public.event_members;
create policy event_members_insert_admin
on public.event_members for insert
with check (public.current_role() = 'admin');

drop policy if exists event_members_update_admin on public.event_members;
create policy event_members_update_admin
on public.event_members for update
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists non_ipl_incomes_select_scoped on public.non_ipl_incomes;
create policy non_ipl_incomes_select_scoped
on public.non_ipl_incomes for select
using (
  deleted_at is null
  and ((scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_view_event_finance(event_id)))
);

drop policy if exists non_ipl_incomes_insert_scoped on public.non_ipl_incomes;
create policy non_ipl_incomes_insert_scoped
on public.non_ipl_incomes for insert
with check (
  (scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_create_event_finance(event_id))
);

drop policy if exists non_ipl_incomes_update_scoped on public.non_ipl_incomes;
create policy non_ipl_incomes_update_scoped
on public.non_ipl_incomes for update
using (
  (scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_manage_event_finance(event_id))
)
with check (
  (scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_manage_event_finance(event_id))
);

-- The previous policy allowed every staff role to read all expenses. Replace
-- it with the event-aware rule; production n8n calls use server credentials,
-- while direct Supabase access now follows the same least-privilege contract.
drop policy if exists expenses_select_staff on public.expenses;
create policy expenses_select_scoped
on public.expenses for select
using (
  deleted_at is null
  and ((scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_view_event_finance(event_id)))
);

drop policy if exists expenses_insert_scoped on public.expenses;
create policy expenses_insert_scoped
on public.expenses for insert
with check (
  (scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_create_event_finance(event_id))
);

drop policy if exists expenses_update_scoped on public.expenses;
create policy expenses_update_scoped
on public.expenses for update
using (
  (scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_manage_event_finance(event_id))
)
with check (
  (scope = 'general' and public.current_role() in ('admin', 'bendahara'))
  or (scope = 'event' and public.can_manage_event_finance(event_id))
);

commit;
