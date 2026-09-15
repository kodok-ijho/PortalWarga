-- Migration: Comprehensive RLS policies on foundation tables using helper functions
-- Task: T1.7 (Ref: requirement.md NFR-1, specification.md §6)
-- Date: 2026-09-13

BEGIN;

-- 1. Tabel tenants: Anggota tenant dapat melihat tenant miliknya, Platform Admin lintas tenant
DROP POLICY IF EXISTS "tenants_select_owner" ON public.tenants;
DROP POLICY IF EXISTS "tenants_select_member_or_admin" ON public.tenants;
CREATE POLICY "tenants_select_member_or_admin" ON public.tenants
  FOR SELECT USING (
    id IN (SELECT public.current_tenant_ids())
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenants_update_owner" ON public.tenants;
DROP POLICY IF EXISTS "tenants_update_admin" ON public.tenants;
CREATE POLICY "tenants_update_admin" ON public.tenants
  FOR UPDATE USING (
    public.is_tenant_admin(id)
  ) WITH CHECK (
    public.is_tenant_admin(id)
  );

-- 2. Tabel tenant_units: Konsumsi helper functions
DROP POLICY IF EXISTS "tenant_units_select_member" ON public.tenant_units;
CREATE POLICY "tenant_units_select_member" ON public.tenant_units
  FOR SELECT USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_units_manage_admin" ON public.tenant_units;
CREATE POLICY "tenant_units_manage_admin" ON public.tenant_units
  FOR ALL USING (
    public.is_tenant_admin(tenant_id)
  ) WITH CHECK (
    public.is_tenant_admin(tenant_id)
  );

-- 3. Tabel tenant_members: Anggota melihat sesama anggota di tenant miliknya
DROP POLICY IF EXISTS "tenant_members_select_tenant" ON public.tenant_members;
CREATE POLICY "tenant_members_select_tenant" ON public.tenant_members
  FOR SELECT USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR user_id = auth.uid()
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_members_update" ON public.tenant_members;
CREATE POLICY "tenant_members_update" ON public.tenant_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR public.is_tenant_admin(tenant_id)
  );

-- 4. Tabel tenant_subscriptions & blocks: Terbuka untuk anggota tenant terkait
DROP POLICY IF EXISTS "tenant_subscriptions_select_owner" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "tenant_subscriptions_select_member" ON public.tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_select_member" ON public.tenant_subscriptions
  FOR SELECT USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_subscriptions_update_owner" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "tenant_subscriptions_update_admin" ON public.tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_update_admin" ON public.tenant_subscriptions
  FOR UPDATE USING (
    public.is_tenant_admin(tenant_id)
  );

DROP POLICY IF EXISTS "subscription_blocks_select_owner" ON public.tenant_subscription_blocks;
DROP POLICY IF EXISTS "subscription_blocks_select_member" ON public.tenant_subscription_blocks;
CREATE POLICY "subscription_blocks_select_member" ON public.tenant_subscription_blocks
  FOR SELECT USING (
    subscription_id IN (
      SELECT id FROM public.tenant_subscriptions
      WHERE tenant_id IN (SELECT public.current_tenant_ids())
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "subscription_payments_select_owner" ON public.subscription_payments;
DROP POLICY IF EXISTS "subscription_payments_select_member" ON public.subscription_payments;
CREATE POLICY "subscription_payments_select_member" ON public.subscription_payments
  FOR SELECT USING (
    subscription_id IN (
      SELECT id FROM public.tenant_subscriptions
      WHERE tenant_id IN (SELECT public.current_tenant_ids())
    )
    OR public.is_platform_admin()
  );

COMMIT;
