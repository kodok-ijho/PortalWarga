-- Migration: Helper functions for RLS and touch_updated_at trigger
-- Task: T1.5 (Ref: requirement.md NFR-1, specification.md §6)
-- Date: 2026-09-13

BEGIN;

-- 1. Trigger touch_updated_at generik
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pasang trigger pada tabel-tabel fondasi
DROP TRIGGER IF EXISTS trg_tenants_updated ON public.tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_block_pricing_updated ON public.block_pricing;
CREATE TRIGGER trg_block_pricing_updated BEFORE UPDATE ON public.block_pricing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_periods_updated ON public.subscription_periods;
CREATE TRIGGER trg_subscription_periods_updated BEFORE UPDATE ON public.subscription_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_subscriptions_updated ON public.tenant_subscriptions;
CREATE TRIGGER trg_tenant_subscriptions_updated BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_payments_updated ON public.subscription_payments;
CREATE TRIGGER trg_subscription_payments_updated BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_units_updated ON public.tenant_units;
CREATE TRIGGER trg_tenant_units_updated BEFORE UPDATE ON public.tenant_units
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_members_updated ON public.tenant_members;
CREATE TRIGGER trg_tenant_members_updated BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Helper current_tenant_ids() — Mengembalikan seluruh tenant_id milik user aktif
CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_members 
  WHERE user_id = auth.uid() AND status = 'approved'
  UNION
  SELECT id FROM public.tenants 
  WHERE owner_id = auth.uid();
$$;

-- 3. Helper is_tenant_admin(t_id) — Mengecek apakah user aktif adalah admin di tenant tertentu
CREATE OR REPLACE FUNCTION public.is_tenant_admin(t_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = t_id AND user_id = auth.uid() AND role = 'admin' AND status = 'approved'
  )
  OR EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = t_id AND owner_id = auth.uid()
  )
  OR public.is_platform_admin();
$$;

-- 4. Helper tenant_subscription_status(t_id) — Mengambil status langganan tenant
CREATE OR REPLACE FUNCTION public.tenant_subscription_status(t_id UUID)
RETURNS public.subscription_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status FROM public.tenant_subscriptions WHERE tenant_id = t_id),
    'read_only'::public.subscription_status
  );
$$;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.tenant_subscription_status(UUID);
-- DROP FUNCTION IF EXISTS public.is_tenant_admin(UUID);
-- DROP FUNCTION IF EXISTS public.current_tenant_ids();
-- DROP TRIGGER IF EXISTS trg_tenant_members_updated ON public.tenant_members;
-- DROP TRIGGER IF EXISTS trg_tenant_units_updated ON public.tenant_units;
-- DROP TRIGGER IF EXISTS trg_subscription_payments_updated ON public.subscription_payments;
-- DROP TRIGGER IF EXISTS trg_tenant_subscriptions_updated ON public.tenant_subscriptions;
-- DROP TRIGGER IF EXISTS trg_subscription_periods_updated ON public.subscription_periods;
-- DROP TRIGGER IF EXISTS trg_block_pricing_updated ON public.block_pricing;
-- DROP TRIGGER IF EXISTS trg_tenants_updated ON public.tenants;
-- DROP FUNCTION IF EXISTS public.touch_updated_at();
