-- =====================================================================
-- Portal Warga Palm Village - Restrict Storage MIME Types
-- ---------------------------------------------------------------------
-- User decision on 2026-07-08:
-- - Allow only jpg/jpeg/png images for app storage uploads.
-- - Keep private buckets.
-- - Keep 2 MB limit because the frontend will resize/compress images.
-- =====================================================================

update storage.buckets
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png'],
  updated_at = now()
where id in (
  'payment-proofs',
  'expense-receipts',
  'profile-avatars'
);
