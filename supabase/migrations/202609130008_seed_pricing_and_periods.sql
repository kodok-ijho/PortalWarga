-- Migration: Seed block pricing and subscription periods
-- Task: T1.8 (Ref: requirement.md FR-7 s/d FR-11, specification.md §2)
-- Date: 2026-09-13

BEGIN;

-- ============================================================
-- 1. SEED SUBSCRIPTION PERIODS
-- ============================================================
-- Opsi durasi: 3 bulan (diskon 0%), 6 bulan (diskon 10%), 12 bulan (diskon 20%)
INSERT INTO public.subscription_periods (duration_months, discount_percent, is_active)
VALUES
  (3, 0.00, true),
  (6, 10.00, true),
  (12, 20.00, true)
ON CONFLICT (duration_months) DO UPDATE
SET discount_percent = EXCLUDED.discount_percent,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ============================================================
-- 2. SEED BLOCK PRICING
-- ============================================================
-- Catatan Perhitungan:
-- price_per_block adalah base price per bulan (sebelum diskon periode).
-- Pada paket tahunan (diskon 20%), user membayar: price_per_block * 0.8 * 12 bulan.
-- Sehingga:
-- - RT/RW:
--   * Blok 10: Base Rp 12.500/bln -> Tahunan nett: Rp 10.000/bln (Total bayar Rp 120.000/thn)
--   * Blok 5:  Base Rp 8.750/bln  -> Tahunan nett: Rp 7.000/bln (Total bayar Rp 84.000/thn, unit cost +40%)
-- - Kos:
--   * Blok 10: Base Rp 25.000/bln -> Tahunan nett: Rp 20.000/bln (Total bayar Rp 240.000/thn)
--   * Blok 5:  Base Rp 17.500/bln -> Tahunan nett: Rp 14.000/bln (Total bayar Rp 168.000/thn, unit cost +40%)
-- - Arisan:
--   * Blok 10: Base Rp 12.500/bln -> Tahunan nett: Rp 10.000/bln (Total bayar Rp 120.000/thn)
--   * Blok 5:  Base Rp 8.750/bln  -> Tahunan nett: Rp 7.000/bln (Total bayar Rp 84.000/thn, unit cost +40%)
-- - Kelas:
--   * Blok 10: Base Rp 6.250/bln  -> Tahunan nett: Rp 5.000/bln (Total bayar Rp 60.000/thn)
--   * Blok 5:  Base Rp 4.375/bln  -> Tahunan nett: Rp 3.500/bln (Total bayar Rp 42.000/thn, unit cost +40%)

INSERT INTO public.block_pricing (tenant_type, block_size, price_per_block, is_active)
VALUES
  -- RT/RW
  ('rt_rw', 10, 12500.00, true),
  ('rt_rw', 5,   8750.00, true),
  -- Kos-kosan
  ('kos',   10, 25000.00, true),
  ('kos',   5,  17500.00, true),
  -- Arisan
  ('arisan', 10, 12500.00, true),
  ('arisan', 5,   8750.00, true),
  -- Kelas
  ('kelas', 10,  6250.00, true),
  ('kelas', 5,   4375.00, true)
ON CONFLICT (tenant_type, block_size) DO UPDATE
SET price_per_block = EXCLUDED.price_per_block,
    is_active = EXCLUDED.is_active,
    updated_at = now();

COMMIT;

-- ROLLBACK:
-- DELETE FROM public.block_pricing WHERE tenant_type IN ('rt_rw', 'kos', 'arisan', 'kelas');
-- DELETE FROM public.subscription_periods WHERE duration_months IN (3, 6, 12);
