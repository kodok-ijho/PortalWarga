-- =====================================================================
-- Migration: 202610050001_documents_management.sql
-- Description: Tabel dan fungsi untuk manajemen dokumen warga, event,
--              dan perumahan (umum & laporan keuangan) terintegrasi Google Drive.
-- =====================================================================

begin;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('resident', 'event', 'estate_general', 'estate_finance')),
  description text,
  
  -- Relasi opsional sesuai kategori dokumen
  unit_id bigint references public.units(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  
  -- Tipe dokumen spesifik
  -- resident: 'ktp', 'kk', 'sim', 'bukti_kepemilikan', 'lainnya'
  -- event: 'proposal', 'laporan_keuangan', 'laporan_kegiatan', 'lpj', 'lainnya'
  -- estate_general: 'ad_art', 'peraturan', 'surat_edaran', 'panduan', 'lainnya'
  -- estate_finance: 'bulanan', 'tahunan', 'neraca', 'lainnya'
  document_type text not null default 'lainnya',
  
  -- Periode / Tahun dokumen (misal '2026-09', '2026')
  period text,
  
  -- Flag visibilitas warga (true = warga non-pengurus / non-panitia dapat melihat)
  is_viewable_by_warga boolean not null default false,
  
  -- Detail file Google Drive
  file_url text not null,               -- link webViewLink / view Google Drive
  file_download_url text,              -- link download langsung / webContentLink
  file_id text not null,               -- Google Drive file ID
  file_name text not null,             -- nama file asli
  file_size bigint,                    -- ukuran file dalam bytes
  mime_type text,                      -- format berkas (PDF, PNG, JPG, dll)
  gdrive_folder_id text not null,      -- ID folder Google Drive
  gdrive_folder_path text,             -- nama folder (misal: 'CB1-1A' atau 'EVT-01-HUT-RI')
  
  -- Jejak audit
  uploaded_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

-- Indeks performa query pencarian dan penyaringan
create index if not exists idx_documents_category on public.documents(category) where deleted_at is null;
create index if not exists idx_documents_unit on public.documents(unit_id) where deleted_at is null;
create index if not exists idx_documents_event on public.documents(event_id) where deleted_at is null;
create index if not exists idx_documents_viewable on public.documents(is_viewable_by_warga) where deleted_at is null;
create index if not exists idx_documents_period on public.documents(period) where deleted_at is null;

commit;
