-- Migration: Row Level Security (RLS) policies for public_listings, listing_pricing, and listing_payments
-- Task: T10.2 (Ref: requirement.md FR-23, FR-24, FR-26, specification.md §6.1)
-- Date: 2026-09-15

BEGIN;

-- ============================================================
-- 1. POLICIES ON public_listings
-- ============================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "public_read_active_listings" ON public.public_listings;
DROP POLICY IF EXISTS "tenant_member_can_post_listing" ON public.public_listings;
DROP POLICY IF EXISTS "owner_can_update_listing" ON public.public_listings;
DROP POLICY IF EXISTS "owner_can_delete_listing" ON public.public_listings;

-- SELECT: Terbuka untuk publik (termasuk anon/belum login) jika status = 'active' dan belum kedaluwarsa,
-- ATAU pemilik postingan, ATAU admin tenant ybs, ATAU platform admin
CREATE POLICY "public_read_active_listings" ON public.public_listings
  FOR SELECT USING (
    (status = 'active' AND expires_at > now())
    OR
    (posted_by IN (SELECT tm.id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
    OR
    (tenant_id IN (SELECT tm2.tenant_id FROM public.tenant_members tm2 WHERE tm2.user_id = auth.uid() AND tm2.role = 'admin' AND tm2.status = 'approved'))
    OR
    public.is_platform_admin()
  );

-- INSERT: Hanya anggota tenant yang sah, dan subscription tenant TIDAK sedang read_only
CREATE POLICY "tenant_member_can_post_listing" ON public.public_listings
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT public.current_tenant_ids())
    AND public.tenant_subscription_status(tenant_id) IN ('trial', 'active')
    AND posted_by IN (
      SELECT tm.id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = public_listings.tenant_id
        AND tm.status = 'approved'
    )
  );

-- UPDATE: Hanya pemilik postingan, tenant admin, atau platform admin
CREATE POLICY "owner_can_update_listing" ON public.public_listings
  FOR UPDATE USING (
    posted_by IN (SELECT tm.id FROM public.tenant_members tm WHERE tm.user_id = auth.uid())
    OR
    tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'admin' AND tm.status = 'approved')
    OR
    public.is_platform_admin()
  );

-- DELETE: Hanya pemilik postingan, tenant admin, atau platform admin
CREATE POLICY "owner_can_delete_listing" ON public.public_listings
  FOR DELETE USING (
    posted_by IN (SELECT tm.id FROM public.tenant_members tm WHERE tm.user_id = auth.uid())
    OR
    tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'admin' AND tm.status = 'approved')
    OR
    public.is_platform_admin()
  );

-- ============================================================
-- 2. POLICIES ON listing_pricing
-- ============================================================

DROP POLICY IF EXISTS "public_read_listing_pricing" ON public.listing_pricing;
DROP POLICY IF EXISTS "platform_admin_manage_listing_pricing" ON public.listing_pricing;

-- SELECT: Terbuka untuk siapa saja (agar katalog harga listing bisa dilihat publik sebelum bayar)
CREATE POLICY "public_read_listing_pricing" ON public.listing_pricing
  FOR SELECT USING (true);

-- INSERT / UPDATE / DELETE: Hanya platform admin
CREATE POLICY "platform_admin_manage_listing_pricing" ON public.listing_pricing
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ============================================================
-- 3. POLICIES ON listing_payments
-- ============================================================

DROP POLICY IF EXISTS "owner_can_view_listing_payments" ON public.listing_payments;
DROP POLICY IF EXISTS "owner_can_create_listing_payment" ON public.listing_payments;
DROP POLICY IF EXISTS "platform_admin_manage_listing_payments" ON public.listing_payments;

-- SELECT: Pemilik listing atau platform admin
CREATE POLICY "owner_can_view_listing_payments" ON public.listing_payments
  FOR SELECT USING (
    listing_id IN (
      SELECT pl.id FROM public.public_listings pl
      JOIN public.tenant_members tm ON tm.id = pl.posted_by
      WHERE tm.user_id = auth.uid()
    )
    OR
    public.is_platform_admin()
  );

-- INSERT: Pemilik listing saat membuat invoice pembayaran atau platform admin
CREATE POLICY "owner_can_create_listing_payment" ON public.listing_payments
  FOR INSERT WITH CHECK (
    listing_id IN (
      SELECT pl.id FROM public.public_listings pl
      JOIN public.tenant_members tm ON tm.id = pl.posted_by
      WHERE tm.user_id = auth.uid()
    )
    OR
    public.is_platform_admin()
  );

-- UPDATE: Platform admin (atau webhook / edge function pembayaran ber-service role)
CREATE POLICY "platform_admin_manage_listing_payments" ON public.listing_payments
  FOR UPDATE USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMIT;

-- ROLLBACK:
-- DROP POLICY IF EXISTS "public_read_active_listings" ON public.public_listings;
-- DROP POLICY IF EXISTS "tenant_member_can_post_listing" ON public.public_listings;
-- DROP POLICY IF EXISTS "owner_can_update_listing" ON public.public_listings;
-- DROP POLICY IF EXISTS "owner_can_delete_listing" ON public.public_listings;
-- DROP POLICY IF EXISTS "public_read_listing_pricing" ON public.listing_pricing;
-- DROP POLICY IF EXISTS "platform_admin_manage_listing_pricing" ON public.listing_pricing;
-- DROP POLICY IF EXISTS "owner_can_view_listing_payments" ON public.listing_payments;
-- DROP POLICY IF EXISTS "owner_can_create_listing_payment" ON public.listing_payments;
-- DROP POLICY IF EXISTS "platform_admin_manage_listing_payments" ON public.listing_payments;
