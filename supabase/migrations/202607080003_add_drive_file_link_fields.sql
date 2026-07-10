-- =====================================================================
-- Portal Warga Palm Village - Google Drive Public-by-Link File Fields
-- ---------------------------------------------------------------------
-- User decision on 2026-07-08:
-- - Payment proof files may be viewable by anyone who has the file link.
-- - Google Drive folder listing must remain private/not public.
-- - Supabase stores durable file metadata and Drive view URLs.
-- - Supabase Storage remains available as a fallback/future option.
-- =====================================================================

alter table public.payments
  add column if not exists proof_file_provider text not null default 'google_drive',
  add column if not exists proof_file_id text,
  add column if not exists proof_file_url text,
  add column if not exists proof_file_name text,
  add column if not exists proof_file_mime_type text,
  add column if not exists proof_file_size bigint,
  add constraint payments_proof_file_provider_check
    check (proof_file_provider in ('google_drive', 'supabase_storage', 'external_url')),
  add constraint payments_proof_file_size_nonnegative
    check (proof_file_size is null or proof_file_size >= 0);

alter table public.expenses
  add column if not exists receipt_file_provider text not null default 'google_drive',
  add column if not exists receipt_file_id text,
  add column if not exists receipt_file_url text,
  add column if not exists receipt_file_name text,
  add column if not exists receipt_file_mime_type text,
  add column if not exists receipt_file_size bigint,
  add constraint expenses_receipt_file_provider_check
    check (receipt_file_provider in ('google_drive', 'supabase_storage', 'external_url')),
  add constraint expenses_receipt_file_size_nonnegative
    check (receipt_file_size is null or receipt_file_size >= 0);

create index if not exists idx_payments_proof_file_id
  on public.payments(proof_file_id);

create index if not exists idx_expenses_receipt_file_id
  on public.expenses(receipt_file_id);
