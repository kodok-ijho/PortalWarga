-- =====================================================================
-- Migration: 202610190001_documents_rls_and_storage_policies.sql
-- Description: Aktifkan Row-Level Security (RLS) dan kebijakan granular
--              untuk public.documents dan storage bucket 'documents'.
-- =====================================================================

begin;

-- 1. Pastikan RLS aktif pada tabel public.documents
alter table public.documents enable row level security;

-- 2. Bersihkan kebijakan lama jika ada
drop policy if exists "documents_select_policy" on public.documents;
drop policy if exists "documents_insert_policy" on public.documents;
drop policy if exists "documents_update_policy" on public.documents;
drop policy if exists "documents_delete_policy" on public.documents;
drop policy if exists "documents_select_own_or_staff" on public.documents;
drop policy if exists "documents_insert_own_or_staff" on public.documents;
drop policy if exists "documents_update_own_or_staff" on public.documents;
drop policy if exists "documents_delete_staff_only" on public.documents;

-- 3. Kebijakan SELECT (Hak Baca)
-- Staf (admin, bendahara, pengurus) dapat membaca semua dokumen.
-- Warga dapat membaca dokumen publik perumahan/laporan/event (is_viewable_by_warga = true),
-- dokumen yang terikat ke unit rumahnya, atau dokumen identitas miliknya sendiri.
create policy "documents_select_policy"
  on public.documents for select
  using (
    (select public.is_staff())
    or (
      deleted_at is null and (
        is_viewable_by_warga = true
        or profile_id = (select public.current_profile_id())
        or exists (
          select 1 from public.profiles p
          where p.id = (select public.current_profile_id())
            and p.unit_id is not null
            and p.unit_id = documents.unit_id
        )
      )
    )
  );

-- 4. Kebijakan INSERT (Hak Unggah)
-- Staf dapat mengunggah dokumen di semua kategori.
-- Warga hanya dapat mengunggah berkas kategori 'resident' untuk profilnya sendiri.
create policy "documents_insert_policy"
  on public.documents for insert
  with check (
    (select public.is_staff())
    or (
      category = 'resident'
      and profile_id = (select public.current_profile_id())
    )
  );

-- 5. Kebijakan UPDATE (Hak Perubahan & Soft Delete)
-- Staf atau pengunggah berkas dapat memperbarui metadata.
create policy "documents_update_policy"
  on public.documents for update
  using (
    (select public.is_staff())
    or uploaded_by = (select public.current_profile_id())
  )
  with check (
    (select public.is_staff())
    or uploaded_by = (select public.current_profile_id())
  );

-- 6. Kebijakan DELETE (Hard Delete - Khusus Staf)
create policy "documents_delete_policy"
  on public.documents for delete
  using (
    (select public.is_staff())
  );

-- 7. Grant izin akses standar
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;

-- 8. Pendaftaran Storage Bucket 'documents' (opsional jika berkas juga diunggah ke storage)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  15728640, -- 15 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies untuk bucket 'documents'
drop policy if exists "documents_storage_select" on storage.objects;
create policy "documents_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      (select public.is_staff())
      or auth.role() = 'authenticated'
    )
  );

drop policy if exists "documents_storage_insert" on storage.objects;
create policy "documents_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (
      (select public.is_staff())
      or auth.role() = 'authenticated'
    )
  );

commit;
