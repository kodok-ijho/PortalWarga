-- =====================================================================
-- Portal Warga Palm Village - Initial Production Schema
-- ---------------------------------------------------------------------
-- Architecture:
-- - Supabase stores durable data and private files.
-- - n8n is the backend/API layer and uses server-side credentials.
-- - Google Account identity is stored in public.profiles.google_sub.
-- - App JWT is issued by n8n, not by Supabase Auth.
-- =====================================================================

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'bendahara', 'pengurus', 'warga');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum (
      'pending_approval',
      'approved',
      'rejected',
      'suspended'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'bill_status') then
    create type public.bill_status as enum ('pending', 'paid', 'overdue', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'draft',
      'pending',
      'pending_verification',
      'completed',
      'failed',
      'expired',
      'cancelled',
      'refunded',
      'rejected'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('qris', 'bank_transfer', 'cash', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'occupancy_status') then
    create type public.occupancy_status as enum (
      'owner_occupied',
      'owner_vacant',
      'owner_rented',
      'tenant',
      'unknown'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'rsvp_status') then
    create type public.rsvp_status as enum ('attending', 'maybe', 'declined');
  end if;
end $$;

create table if not exists public.units (
  id bigint generated always as identity primary key,
  block text not null,
  unit_number text not null,
  floor int,
  size numeric(8,2),
  occupancy_status public.occupancy_status not null default 'unknown',
  is_occupied boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block, unit_number)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null unique,
  full_name text not null,
  avatar_url text,
  phone text,
  role public.user_role not null default 'warga',
  unit_id bigint references public.units(id) on delete set null,
  approval_status public.approval_status not null default 'pending_approval',
  is_active boolean not null default true,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  approval_note text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(email)),
  constraint profiles_approved_warga_has_unit check (
    approval_status <> 'approved'
    or role <> 'warga'
    or unit_id is not null
  )
);

create table if not exists public.ipl_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ipl_components (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ipl_components_amount_nonnegative check (amount >= 0)
);

create table if not exists public.ipl_bills (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references public.units(id) on delete restrict,
  resident_id uuid references public.profiles(id) on delete set null,
  period text not null,
  amount numeric(12,2) not null,
  late_fee numeric(12,2) not null default 0,
  due_date date not null,
  status public.bill_status not null default 'pending',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, period),
  constraint ipl_bills_period_format check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint ipl_bills_amount_nonnegative check (amount >= 0),
  constraint ipl_bills_late_fee_nonnegative check (late_fee >= 0)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  ipl_bill_id uuid not null references public.ipl_bills(id) on delete restrict,
  resident_id uuid references public.profiles(id) on delete set null,
  amount numeric(12,2) not null,
  method public.payment_method not null default 'qris',
  status public.payment_status not null default 'pending',
  order_id text unique,
  transaction_id text,
  proof_file_path text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  verification_note text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amount_nonnegative check (amount >= 0)
);

alter table public.ipl_bills
  add column if not exists payment_id uuid references public.payments(id) on delete set null;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  amount numeric(12,2) not null,
  description text,
  receipt_file_path text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date timestamptz not null,
  location text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rsvp (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  status public.rsvp_status not null default 'attending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, resident_id)
);

create table if not exists public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.forum_categories(id) on delete set null,
  title text not null,
  author_id uuid references public.profiles(id) on delete set null,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.forum_posts(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile_id()
returns uuid
language plpgsql
stable
as $$
declare
  raw_sub text;
begin
  raw_sub := nullif(auth.jwt()->>'sub', '');
  if raw_sub is null then
    return null;
  end if;
  return raw_sub::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = public.current_profile_id();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('admin', 'bendahara', 'pengurus'), false);
$$;

create or replace function public.is_bendahara_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('admin', 'bendahara'), false);
$$;

drop trigger if exists trg_units_updated on public.units;
create trigger trg_units_updated before update on public.units
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ipl_settings_updated on public.ipl_settings;
create trigger trg_ipl_settings_updated before update on public.ipl_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ipl_components_updated on public.ipl_components;
create trigger trg_ipl_components_updated before update on public.ipl_components
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ipl_bills_updated on public.ipl_bills;
create trigger trg_ipl_bills_updated before update on public.ipl_bills
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated before update on public.payments
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_expenses_updated on public.expenses;
create trigger trg_expenses_updated before update on public.expenses
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_events_updated on public.events;
create trigger trg_events_updated before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_rsvp_updated on public.rsvp;
create trigger trg_rsvp_updated before update on public.rsvp
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_forum_categories_updated on public.forum_categories;
create trigger trg_forum_categories_updated before update on public.forum_categories
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_forum_threads_updated on public.forum_threads;
create trigger trg_forum_threads_updated before update on public.forum_threads
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_forum_posts_updated on public.forum_posts;
create trigger trg_forum_posts_updated before update on public.forum_posts
  for each row execute function public.touch_updated_at();

create index if not exists idx_units_block_number on public.units(block, unit_number);
create index if not exists idx_profiles_google_sub on public.profiles(google_sub);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_approval_status on public.profiles(approval_status, created_at);
create index if not exists idx_profiles_unit_id on public.profiles(unit_id);
create index if not exists idx_ipl_components_active_sort on public.ipl_components(is_active, sort_order);
create index if not exists idx_ipl_bills_resident_status on public.ipl_bills(resident_id, status);
create index if not exists idx_ipl_bills_period on public.ipl_bills(period);
create index if not exists idx_ipl_bills_period_status on public.ipl_bills(period, status);
create index if not exists idx_ipl_bills_due_date on public.ipl_bills(due_date);
create index if not exists idx_payments_resident on public.payments(resident_id);
create index if not exists idx_payments_ipl_bill on public.payments(ipl_bill_id);
create index if not exists idx_payments_transaction on public.payments(transaction_id);
create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_payments_status_paid_at on public.payments(status, paid_at);
create index if not exists idx_expenses_expense_date on public.expenses(expense_date);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_events_date on public.events(event_date);
create index if not exists idx_rsvp_resident on public.rsvp(resident_id);
create index if not exists idx_forum_threads_category on public.forum_threads(category_id);
create index if not exists idx_forum_posts_thread on public.forum_posts(thread_id);
create index if not exists idx_forum_posts_parent on public.forum_posts(parent_id);

alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.ipl_settings enable row level security;
alter table public.ipl_components enable row level security;
alter table public.ipl_bills enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.events enable row level security;
alter table public.rsvp enable row level security;
alter table public.forum_categories enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;

-- Reference policies for possible future direct Supabase reads.
-- Production frontend should still use n8n protected APIs.
create policy "profiles_select_self_or_staff"
  on public.profiles for select
  using (id = public.current_profile_id() or public.is_staff());

create policy "units_select_approved"
  on public.units for select
  using (public.current_profile_id() is not null);

create policy "bills_select_own_or_staff"
  on public.ipl_bills for select
  using (resident_id = public.current_profile_id() or public.is_staff());

create policy "payments_select_own_or_staff"
  on public.payments for select
  using (resident_id = public.current_profile_id() or public.is_staff());

create policy "expenses_select_staff"
  on public.expenses for select
  using (public.is_staff());

create policy "audit_logs_select_admin"
  on public.audit_logs for select
  using (public.current_role() = 'admin');

create policy "events_select_approved"
  on public.events for select
  using (public.current_profile_id() is not null);

create policy "rsvp_select_approved"
  on public.rsvp for select
  using (public.current_profile_id() is not null);

create policy "forum_categories_select_approved"
  on public.forum_categories for select
  using (public.current_profile_id() is not null);

create policy "forum_threads_select_approved"
  on public.forum_threads for select
  using (public.current_profile_id() is not null);

create policy "forum_posts_select_approved"
  on public.forum_posts for select
  using (public.current_profile_id() is not null);

insert into public.ipl_settings (key, value) values
  ('billing.default_due_day', '{"day": 10}'::jsonb),
  ('billing.start_period', '{"period": "2025-01"}'::jsonb),
  ('payment.midtrans_environment', '{"environment": "sandbox"}'::jsonb)
on conflict (key) do nothing;

insert into public.forum_categories (name, description) values
  ('Umum', 'Diskusi umum warga'),
  ('Fasilitas', 'Laporan dan saran fasilitas kompleks'),
  ('Keamanan', 'Informasi dan laporan keamanan'),
  ('Saran', 'Saran untuk pengelola')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'payment-proofs',
    'payment-proofs',
    false,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'expense-receipts',
    'expense-receipts',
    false,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'profile-avatars',
    'profile-avatars',
    false,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
