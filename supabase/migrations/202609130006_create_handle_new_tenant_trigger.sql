-- Migration: Trigger handle_new_tenant for auto-provisioning trial and admin membership
-- Task: T1.6 (Ref: requirement.md FR-4, FR-7, specification.md §2)
-- Date: 2026-09-13

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id UUID;
BEGIN
  -- 1. Buat record subscription trial 15 hari
  INSERT INTO public.tenant_subscriptions (
    tenant_id,
    status,
    trial_started_at,
    trial_ends_at
  ) VALUES (
    NEW.id,
    'trial',
    now(),
    now() + INTERVAL '15 days'
  ) RETURNING id INTO v_subscription_id;

  -- 2. Alokasikan 1 blok trial besar (10 unit kapasitas) sesuai FR-4
  INSERT INTO public.tenant_subscription_blocks (
    subscription_id,
    block_size,
    quantity,
    price_snapshot
  ) VALUES (
    v_subscription_id,
    10,
    1,
    0
  );

  -- 3. Daftarkan owner sebagai admin aktif pada tenant_members
  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    full_name,
    role,
    status
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    COALESCE(NEW.name || ' (Admin)', 'Admin'),
    'admin',
    'approved'
  ) ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = 'admin', status = 'approved';

  RETURN NEW;
END;
$$;

-- Pasang trigger pada tabel tenants
DROP TRIGGER IF EXISTS trg_new_tenant_provisioning ON public.tenants;
CREATE TRIGGER trg_new_tenant_provisioning
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_tenant();

COMMIT;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_new_tenant_provisioning ON public.tenants;
-- DROP FUNCTION IF EXISTS public.handle_new_tenant();
