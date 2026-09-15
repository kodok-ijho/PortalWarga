-- Migration: Check public listing expirations (Active to Expired, Featured expiry)
-- Task: T10.7 (Ref: requirement.md FR-28, FR-29; specification.md §5.1)
-- Date: 2026-09-15

BEGIN;

-- 1. Fungsi check_listing_expirations() (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_listing_expirations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_unfeatured_count INTEGER := 0;
BEGIN
  -- 1. Transisi listing active yang melewati batas expires_at menjadi expired
  WITH expired_rows AS (
    UPDATE public.public_listings
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'active'
      AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO v_expired_count FROM expired_rows;

  -- 2. Nonaktifkan status featured jika masa featured_until sudah terlewati
  WITH unfeatured_rows AS (
    UPDATE public.public_listings
    SET is_featured = false,
        featured_until = NULL,
        updated_at = now()
    WHERE is_featured = true
      AND featured_until IS NOT NULL
      AND featured_until < now()
    RETURNING id
  )
  SELECT count(*) INTO v_unfeatured_count FROM unfeatured_rows;

  RETURN jsonb_build_object(
    'success', true,
    'expired_listings_count', v_expired_count,
    'unfeatured_listings_count', v_unfeatured_count,
    'processed_at', now()
  );
END;
$$;

-- Berikan hak eksekusi ke authenticated dan service_role
GRANT EXECUTE ON FUNCTION public.check_listing_expirations() TO authenticated, service_role;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.check_listing_expirations();
