-- Migration: Create activate_listing_payment RPC function and enhance listing_payments table
-- Task: T10.6 (Ref: requirement.md FR-25, FR-28, FR-29, specification.md §5.1, §9)
-- Date: 2026-09-15

BEGIN;

-- ============================================================
-- 1. ADD COLUMNS TO listing_payments
-- ============================================================

ALTER TABLE public.listing_payments
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_url TEXT;

-- ============================================================
-- 2. CREATE FUNCTION activate_listing_payment
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_listing_payment(
  p_payment_id UUID,
  p_gateway_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_listing RECORD;
  v_new_expires TIMESTAMPTZ;
  v_new_featured_until TIMESTAMPTZ;
  v_duration INTEGER;
  v_is_featured BOOLEAN;
BEGIN
  -- 1. Ambil record pembayaran listing
  SELECT * INTO v_payment
  FROM public.listing_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record not found');
  END IF;

  -- 2. Idempotency: Jika sudah berstatus paid, return success
  IF v_payment.status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Payment already settled',
      'payment_id', v_payment.id,
      'listing_id', v_payment.listing_id
    );
  END IF;

  -- 3. Ambil data listing
  SELECT * INTO v_listing
  FROM public.public_listings
  WHERE id = v_payment.listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Associated listing not found');
  END IF;

  -- 4. Hitung masa aktif dan status featured
  v_duration := COALESCE(v_payment.duration_days, 30);
  v_is_featured := COALESCE(v_payment.is_featured, false);

  -- Perpanjang masa aktif: jika saat ini aktif dan belum expired, perpanjang dari expires_at
  IF v_listing.status = 'active' AND v_listing.expires_at > now() THEN
    v_new_expires := v_listing.expires_at + (v_duration || ' days')::interval;
  ELSE
    v_new_expires := now() + (v_duration || ' days')::interval;
  END IF;

  -- Tentukan masa featured jika pembayaran mencakup fitur unggulan
  IF v_is_featured THEN
    IF v_listing.is_featured AND v_listing.featured_until IS NOT NULL AND v_listing.featured_until > now() THEN
      v_new_featured_until := v_listing.featured_until + (v_duration || ' days')::interval;
    ELSE
      v_new_featured_until := now() + (v_duration || ' days')::interval;
    END IF;
  ELSE
    -- Jika tidak beli featured baru, pertahankan featured sebelumnya bila masih berlaku
    IF v_listing.is_featured AND v_listing.featured_until IS NOT NULL AND v_listing.featured_until > now() THEN
      v_new_featured_until := v_listing.featured_until;
      v_is_featured := true;
    ELSE
      v_new_featured_until := NULL;
      v_is_featured := false;
    END IF;
  END IF;

  -- 5. Update record di listing_payments
  UPDATE public.listing_payments
  SET status = 'paid',
      paid_at = now(),
      qris_ref = COALESCE(p_gateway_ref, qris_ref),
      updated_at = now()
  WHERE id = p_payment_id;

  -- 6. Update record di public_listings
  UPDATE public.public_listings
  SET status = 'active',
      expires_at = v_new_expires,
      is_featured = v_is_featured,
      featured_until = v_new_featured_until,
      updated_at = now()
  WHERE id = v_listing.id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'listing_id', v_listing.id,
    'status', 'active',
    'is_featured', v_is_featured,
    'expires_at', v_new_expires,
    'featured_until', v_new_featured_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_listing_payment(UUID, TEXT) TO authenticated, service_role;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.activate_listing_payment(UUID, TEXT);
-- ALTER TABLE public.listing_payments DROP COLUMN IF EXISTS payment_url;
-- ALTER TABLE public.listing_payments DROP COLUMN IF EXISTS metadata;
-- ALTER TABLE public.listing_payments DROP COLUMN IF EXISTS duration_days;
-- ALTER TABLE public.listing_payments DROP COLUMN IF EXISTS is_featured;
