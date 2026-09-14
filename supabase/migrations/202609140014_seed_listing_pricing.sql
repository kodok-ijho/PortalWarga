-- Migration: Seed initial listing pricing catalogue
-- Task: T10.3 (Ref: requirement.md FR-25, FR-29, specification.md §5.1, task.md T10.3)
-- Date: 2026-09-15

BEGIN;

-- ============================================================
-- SEED INITIAL LISTING PRICING CATALOGUE
-- ============================================================
-- Harga listing biasa vs unggulan (featured) per tipe:
-- 1. Kamar Kos (room_vacancy):
--    - Standar (30 hari): Rp 15.000 (biaya per postingan kamar sewa)
--    - Unggulan / Featured (30 hari): Rp 35.000 (tampil prioritas di katalog publik)
-- 2. UMKM Warga (umkm):
--    - Standar (30 hari): Rp 10.000 (biaya per promosi usaha rumahan warga)
--    - Unggulan / Featured (30 hari): Rp 25.000 (highlight dan pin di atas etalase UMKM)

INSERT INTO public.listing_pricing (listing_type, is_featured, duration_days, price)
VALUES
  ('room_vacancy', false, 30, 15000.00),
  ('room_vacancy', true,  30, 35000.00),
  ('umkm',         false, 30, 10000.00),
  ('umkm',         true,  30, 25000.00)
ON CONFLICT (listing_type, is_featured, duration_days) DO UPDATE
SET price = EXCLUDED.price,
    updated_at = now();

COMMIT;

-- ROLLBACK:
-- DELETE FROM public.listing_pricing WHERE listing_type IN ('room_vacancy', 'umkm');
