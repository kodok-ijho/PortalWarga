-- Migration: Enforce read-only restriction on operational tables in RLS
-- Task: T5.3 (Ref: requirement.md FR-15, specification.md §6)
-- Date: 2026-09-14

BEGIN;

-- 1. Perbarui policy tenant_units_manage_admin agar menolak INSERT/UPDATE/DELETE saat status read_only
DROP POLICY IF EXISTS "tenant_units_manage_admin" ON public.tenant_units;

CREATE POLICY "tenant_units_manage_admin" ON public.tenant_units
  FOR ALL USING (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  ) WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  );

COMMIT;

-- ROLLBACK:
-- DROP POLICY IF EXISTS "tenant_units_manage_admin" ON public.tenant_units;
-- CREATE POLICY "tenant_units_manage_admin" ON public.tenant_units
--   FOR ALL USING (
--     public.is_tenant_admin(tenant_id)
--   ) WITH CHECK (
--     public.is_tenant_admin(tenant_id)
--   );
