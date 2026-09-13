-- Migration: Create platform_admins table and is_platform_admin function
-- Task: T1.3 (Ref: requirement.md FR-0.1, FR-0.2, specification.md §7.1, §6)
-- Date: 2026-09-13

BEGIN;

-- 1. Tabel platform_admins
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Fungsi is_platform_admin() (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

-- 3. RLS Tabel platform_admins
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'platform_admins' AND policyname = 'platform_admins_select_admin'
  ) THEN
    CREATE POLICY "platform_admins_select_admin" ON public.platform_admins
      FOR SELECT USING (
        public.is_platform_admin()
      );
  END IF;

  -- 4. Hak akses lintas tenant untuk Platform Admin pada tabel fondasi
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'platform_admin_select_all_tenants'
  ) THEN
    CREATE POLICY "platform_admin_select_all_tenants" ON public.tenants
      FOR SELECT USING (
        public.is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'block_pricing' AND policyname = 'platform_admin_manage_block_pricing'
  ) THEN
    CREATE POLICY "platform_admin_manage_block_pricing" ON public.block_pricing
      FOR ALL USING (
        public.is_platform_admin()
      ) WITH CHECK (
        public.is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_periods' AND policyname = 'platform_admin_manage_subscription_periods'
  ) THEN
    CREATE POLICY "platform_admin_manage_subscription_periods" ON public.subscription_periods
      FOR ALL USING (
        public.is_platform_admin()
      ) WITH CHECK (
        public.is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_subscriptions' AND policyname = 'platform_admin_select_all_subscriptions'
  ) THEN
    CREATE POLICY "platform_admin_select_all_subscriptions" ON public.tenant_subscriptions
      FOR SELECT USING (
        public.is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_subscription_blocks' AND policyname = 'platform_admin_select_all_subscription_blocks'
  ) THEN
    CREATE POLICY "platform_admin_select_all_subscription_blocks" ON public.tenant_subscription_blocks
      FOR SELECT USING (
        public.is_platform_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_payments' AND policyname = 'platform_admin_select_all_subscription_payments'
  ) THEN
    CREATE POLICY "platform_admin_select_all_subscription_payments" ON public.subscription_payments
      FOR SELECT USING (
        public.is_platform_admin()
      );
  END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- DROP POLICY IF EXISTS "platform_admin_select_all_subscription_payments" ON public.subscription_payments;
-- DROP POLICY IF EXISTS "platform_admin_select_all_subscription_blocks" ON public.tenant_subscription_blocks;
-- DROP POLICY IF EXISTS "platform_admin_select_all_subscriptions" ON public.tenant_subscriptions;
-- DROP POLICY IF EXISTS "platform_admin_manage_subscription_periods" ON public.subscription_periods;
-- DROP POLICY IF EXISTS "platform_admin_manage_block_pricing" ON public.block_pricing;
-- DROP POLICY IF EXISTS "platform_admin_select_all_tenants" ON public.tenants;
-- DROP TABLE IF EXISTS public.platform_admins;
-- DROP FUNCTION IF EXISTS public.is_platform_admin();
